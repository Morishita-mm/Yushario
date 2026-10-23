import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { questTitle } from "../../core/quests";
import { townKey, type TownRecord } from "../../core/town-ledger";
import { TACTICS, researchRequest, tacticFit, type TacticMember } from "../../core/tactics";
import type { MobileFormMember, MobileWorkDraft, MobileWorkRequestBody, MobileWorkStep, MobileLaunch } from "../../core/mobile-work";
import type { MobileWorkResponseBody, MobileDelivery } from "../../core/mobile-work-display";
import type { QuestParty } from "../party";
import type { QuestTactics } from "../tactics";
import { serverLanguage } from "../language";
import type { MobileStore } from "./store";
import { MobileWorkCatalog } from "./work-catalog";
import { MobileDepartures } from "./work-departure";
import { auditMobileWork } from "./work-audit";
import { reserveMobileMutation, type WorkEffect } from "./quest-requests";

type Form = Pick<MobileWorkDraft, "text" | "tactic" | "members">;
type PlanStep = MobileWorkStep & { text: string; session: string };
// The mobile entry point intentionally has no terminal-input, cwd, command,
// handoff, recall, live-party, adoption or new-worktree operation.
export class MobileWork {
  private readonly forms = new Map<string, Form>();
  private readonly departureKey = randomBytes(32); // Never persist a guessable hash of private instructions.
  private readonly launched = new Map<string, string>();
  private readonly departures: MobileDepartures;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly store: MobileStore, private readonly catalog: MobileWorkCatalog,
    private readonly party: QuestParty, private readonly tactics: QuestTactics, private readonly towns: () => readonly TownRecord[]) {
    this.departures = new MobileDepartures(store.directory);
  }
  operate(request: MobileWorkRequestBody & { deviceId: string }): Promise<MobileWorkResponseBody> {
    // Serialize remote mutations across devices too. Local Mac edits are checked
    // again after every async resolution and immediately before spawning.
    const run = this.tail.then(() => this.perform(request));
    this.tail = run.catch(() => undefined); return run;
  }
  private allowed(device: string): void {
    if (!this.store.devices.some(item => item.id === device && item.allowWork)) throw Error("Mobile work disabled");
  }
  private reserve(device: string, requestId: string, operation: string, quest: string, effect: WorkEffect): void {
    if (!this.store.devices.some(item => item.id === device)) throw Error("Device revoked");
    if (effect !== "none") this.allowed(device);
    reserveMobileMutation(this.store.directory, device, requestId, operation, quest, effect);
  }
  private audit(deviceId: string, operation: string, questId: string, heroId: string | null = null): void {
    auditMobileWork(this.store.directory, { deviceId, operation, questId, heroId, time: Date.now() });
  }
  private quest(id: string) {
    const quest = this.party.quests.get(id);
    if (!quest || !this.towns().some(town => townKey(town) === quest.town)) throw Error("Unknown quest");
    return quest;
  }
  private editable(id: string): boolean {
    const quest = this.quest(id);
    return (quest.state === "open" || quest.state === "waiting" && this.departures.hadForm(id)) && !this.departures.has(id)
      && !quest.events.some(event => ["request", "report", "command", "handoff"].includes(event.kind));
  }
  private requireForm(id: string): void { if (!this.editable(id)) throw Error("Not a forming quest"); }
  private members(id: string): MobileFormMember[] {
    return this.party.quests.party(id).map(member => {
      if (member.role === "test") throw Error("Unsupported mobile role");
      const heroId = this.catalog.heroId(member.session);
      return { heroId, role: member.role, writer: member.writer,
        ask: this.forms.get(id)?.members.find(item => item.heroId === heroId)?.ask ?? "" };
    });
  }
  private fitMembers(id: string): TacticMember[] {
    return this.party.quests.party(id).map(member => ({ ...member, active: Boolean(this.party.pty.agentSession(member.session)?.active), cwd: this.party.pty.getSession(member.session)?.cwd }));
  }
  private draft(id: string): MobileWorkDraft {
    const quest = this.quest(id), form = this.forms.get(id), lost = !form && this.departures.hadForm(id);
    return { questId: id, text: form?.text ?? (lost ? "" : quest.purpose), tactic: form?.tactic ?? this.tactics.tactic(id), members: this.members(id),
      fits: TACTICS.map(tactic => { const fit = tacticFit(tactic, this.fitMembers(id)); return { tactic, ...fit,
        inside: fit.inside.map(session => this.catalog.heroId(session)), outside: fit.outside.map(session => this.catalog.heroId(session)) }; }),
      editable: this.editable(id), draftLost: lost, departure: this.departures.view(id) };
  }
  private signature(id: string, form: Form): string {
    const members = this.party.quests.party(id).map(({ session, role, writer, joinedAt }) => [session, role, writer, joinedAt]);
    return createHmac("sha256", this.departureKey).update(JSON.stringify([form, members])).digest("hex");
  }
  private resolveMembers(town: string, members: MobileFormMember[]) {
    if (members.filter(item => item.writer).length > 1 || members.some(item => item.writer && item.role !== "implement")
      || members.filter(item => item.role === "command").length > 1) throw Error("Invalid party");
    return members.map(member => {
      const hero = this.catalog.hero(member.heroId, town), session = hero.session && this.party.pty.getSession(hero.session);
      if (!session || !hero.active || !hero.canTalk) throw Error("Hero unavailable");
      return { member, session };
    });
  }
  private assignmentEffect(town: string, members: MobileFormMember[], quest?: string): WorkEffect {
    const pending = this.party.pty.pending();
    return members.some(member => {
      const hero = this.catalog.hero(member.heroId, town);
      const previous = hero.session && this.party.quests.member(hero.session);
      return member.role === "command" || hero.busy || previous && previous.quest !== quest
        || pending.some(item => item.terminal === hero.session && (item.texts.length > 0 || item.equipment));
    }) ? "send" : "none";
  }
  private validateForm(id: string, form: Form) {
    this.requireForm(id);
    const resolved = this.resolveMembers(this.quest(id).town, form.members);
    const fits = resolved.map(({ member, session }, index) => ({ ...member, session: session.id, cwd: session.cwd, active: true, joinedAt: index }));
    if (!tacticFit(form.tactic, fits).ok) throw Error("Tactic does not fit");
    return resolved;
  }
  private applyForm(id: string, form: Form): void {
    const resolved = this.validateForm(id, form);
    this.departures.markForm(id); // A crash must disclose that unsaved instructions were lost.
    // Never arm a tactic or its notes merely by saving a form. An existing busy
    // member's Stop could otherwise activate helpers without an authorized departure.
    this.tactics.forgetQuest(id); this.tactics.choose(id, "obey");
    for (const old of this.party.quests.party(id)) if (!resolved.some(item => item.session.id === old.session)) this.party.quests.leave(id, old.session);
    // Clear an old writer before installing another (the ledger enforces one).
    for (const old of this.party.quests.party(id)) if (old.writer && !resolved.some(item => item.session.id === old.session && item.member.writer)) {
      const session = this.party.pty.getSession(old.session); if (session) this.party.quests.join(id, session, old.role, "", false);
    }
    for (const { member, session } of resolved) this.party.quests.join(id, session, member.role, "", member.writer);
    const owner = resolved.find(item => item.member.writer);
    if (owner) this.party.quests.assign(id, owner.session); // Keep the owner's base aligned, as the Mac assignment API does.
    this.forms.set(id, form);
  }
  private async spawn(device: string, quest: string, launch: MobileLaunch, role: MobileFormMember["role"], writer: boolean): Promise<string> {
    this.requireForm(quest); this.allowed(device);
    const options = await this.catalog.launchOptions(this.quest(quest).town, launch);
    this.requireForm(quest); this.allowed(device);
    const session = await this.party.pty.create(options, undefined, { mobile: true, beforeLaunch: info => {
      this.requireForm(quest); this.allowed(device);
      if (info.project !== this.quest(quest).town) throw Error("Base moved to another town");
      for (const [id] of this.launched) if (!this.party.pty.agentSession(id)?.active) this.launched.delete(id);
      if ([...this.launched.values()].filter(id => id === device).length >= 2) throw Error("Mobile session limit");
      this.audit(device, "spawn", quest, this.catalog.heroId(info.id)); this.launched.set(info.id, device);
    } });
    try {
      this.allowed(device); this.requireForm(quest);
      this.party.quests.join(quest, session, role, "", writer);
      if (writer) this.party.quests.assign(quest, session);
      const id = this.catalog.heroId(session.id), form = this.forms.get(quest)!;
      form.members = this.members(quest); return id;
    } catch (error) { this.party.pty.end(session.id); throw error; }
  }
  private plan(id: string, form: Form): PlanStep[] {
    const quest = this.quest(id), members = this.party.quests.party(id), fit = tacticFit(form.tactic, this.fitMembers(id));
    const owner = members.find(member => member.writer), lead = form.tactic === "delegate" ? members.find(member => member.role === "command") : owner;
    if (!owner || !lead || !fit.ok || !form.text.trim() || form.text.length > 8000) throw Error("Party not ready");
    const steps: PlanStep[] = [];
    if (form.tactic !== "research") steps.push({ heroId: this.catalog.heroId(lead.session), session: lead.session, kind: "request", state: "pending", text: form.text });
    for (const member of members) {
      if (member.session === lead.session) continue;
      const heroId = this.catalog.heroId(member.session), ask = form.members.find(item => item.heroId === heroId)?.ask ?? "";
      const research = form.tactic === "research" && fit.inside.includes(member.session);
      const deferred = form.tactic === "review" && member.role === "review" || form.tactic === "research" && member.role === "research" && !research;
      if (!ask.trim() && !research) continue;
      const text = research ? researchRequest(form.text, ask, serverLanguage()) : ask;
      if (text.length > 8000) throw Error("Composed request too long");
      // Resolve a previously issued ID again, never accept a raw session from the phone.
      this.catalog.hero(heroId, quest.town);
      steps.push({ heroId, session: member.session, kind: research ? "research" : "ask", state: deferred ? "deferred" : "pending", text });
    }
    return steps;
  }
  private depart(device: string, id: string): MobileWorkDraft {
    this.allowed(device);
    const form = this.forms.get(id);
    if (!form) throw Error("Form draft lost");
    const signature = this.signature(id, form), existing = this.departures.has(id);
    if (existing && (!this.departures.canContinue(id, signature) || this.tactics.tactic(id) !== form.tactic || ["done", "dropped"].includes(this.quest(id).state))) throw Error("Departure cannot resume");
    if (!existing) this.requireForm(id);
    const steps = this.plan(id, form);
    if (!existing) {
      this.departures.begin(id, signature, steps.map(({ heroId, kind, state }) => ({ heroId, kind, state })));
      this.tactics.choose(id, form.tactic);
      this.tactics.setNotes(id, Object.fromEntries(steps.filter(step => step.kind === "research" || step.state === "deferred")
        .map(step => [step.session, form.members.find(member => member.heroId === step.heroId)?.ask ?? ""])));
    }
    const deliver = (step: PlanStep): boolean => this.departures.deliver(id, step.heroId, step.kind,
      () => { const agent = this.party.pty.agentSession(step.session); return Boolean(agent?.active && agent.canSay); },
      () => { this.allowed(device); this.audit(device, "send", id, step.heroId); return this.party.send(id, step.session, step.text, step.kind === "research" ? "tactic" : "request"); });
    if (form.tactic === "research") this.tactics.startMobileResearch(id, form.text, session => {
      const step = steps.find(item => item.session === session && item.kind === "research"); return Boolean(step && deliver(step));
    });
    for (const step of steps) if (step.kind !== "research" && step.state !== "deferred") deliver(step);
    return this.draft(id);
  }
  private async perform(request: MobileWorkRequestBody & { deviceId: string }): Promise<MobileWorkResponseBody> {
    const { deviceId, operation } = request;
    if (!this.store.devices.some(item => item.id === deviceId)) throw Error("Device revoked");
    if (request.operation === "quest-options") return { operation: request.operation, body: await this.catalog.options(request.body.townId, this.store.devices.find(item => item.id === deviceId)!.allowWork) };
    if (request.operation === "quest-draft") return { operation: request.operation, body: { draft: this.draft(request.body.questId) } };
    if (request.operation === "quest-prepare") {
      const input = request.body, town = this.catalog.town(input.townId), id = randomUUID(), text = input.text.trim();
      if (input.launch) await this.catalog.launchOptions(town, input.launch);
      const hero = input.heroId ? this.resolveMembers(town, [{ heroId: input.heroId, role: "implement", writer: true, ask: "" }])[0] : undefined;
      const effect = input.launch ? "spawn" : input.mode === "send" && hero ? "send"
        : this.assignmentEffect(town, hero ? [{ heroId: input.heroId!, role: "implement", writer: true, ask: "" }] : []);
      this.reserve(deviceId, input.requestId, operation, id, effect); this.audit(deviceId, "prepare", id, input.heroId);
      this.party.quests.create(town, questTitle(text), text, Date.now(), id);
      this.applyForm(id, { text, tactic: "obey", members: hero ? [{ heroId: input.heroId!, role: "implement", writer: true, ask: "" }] : [] });
      let heroId = input.heroId, delivery: MobileDelivery = "none";
      if (input.launch) heroId = await this.spawn(deviceId, id, input.launch, "implement", true);
      else if (input.mode === "send" && hero) {
        const draft = this.depart(deviceId, id), state = draft.departure.steps[0]?.state;
        if (state !== "sent" && state !== "held") throw Error("Delivery uncertain");
        delivery = state;
      }
      return { operation: request.operation, body: { draft: this.draft(id), heroId, delivery } };
    }
    const id = request.body.questId;
    if (request.operation === "quest-form") {
      this.requireForm(id);
      // Validate the complete plan before reserving/mutating; apply rechecks scope.
      this.validateForm(id, request.body);
      this.reserve(deviceId, request.body.requestId, operation, id, this.assignmentEffect(this.quest(id).town, request.body.members, id));
      if (!request.body.members.length) this.audit(deviceId, "form", id);
      for (const member of request.body.members) this.audit(deviceId, "form", id, member.heroId);
      this.applyForm(id, { text: request.body.text.trim(), members: request.body.members, tactic: request.body.tactic });
      return { operation: request.operation, body: { draft: this.draft(id) } };
    }
    if (request.operation === "quest-embark") {
      this.requireForm(id);
      if (this.draft(id).draftLost || !this.forms.has(id) || this.members(id).length >= 16
        || request.body.writer && (request.body.role !== "implement" || this.members(id).some(member => member.writer))
        || request.body.role === "command" && this.members(id).some(member => member.role === "command")) throw Error("Invalid new member");
      await this.catalog.launchOptions(this.quest(id).town, request.body.launch);
      this.reserve(deviceId, request.body.requestId, operation, id, "spawn");
      const heroId = await this.spawn(deviceId, id, request.body.launch, request.body.role, request.body.writer);
      return { operation: request.operation, body: { draft: this.draft(id), heroId } };
    }
    this.quest(id); this.allowed(deviceId);
    this.reserve(deviceId, request.body.requestId, operation, id, "depart"); this.audit(deviceId, "setoff", id);
    return { operation: "quest-depart", body: { draft: this.depart(deviceId, id) } };
  }
}
