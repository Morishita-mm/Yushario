import type { AgentEvent } from "../core/events";
import { TACTICS, fixRequest, parseVerdict, relayToCommander, researchedRequest, researchRequest, reviewRequest, tacticFit, tacticLabel, REVIEW_ROUNDS,
  type Tactic, type TacticMember, type TacticStatus, type Verdict } from "../core/tactics";
import type { QuestParty } from "./party";
import type { TerminalSession } from "./pty-session";
import { serverLanguage, tr } from "./language";

// One automatic run: a review round or the research before the owner starts.
type Run = { kind: "review" | "research"; round: number; waiting: Set<string>; replies: Map<string, { verdict?: Verdict; text: string }>;
  request?: string; stopped?: string; done?: boolean };

// Moves a party along its tactic by watching hook events (docs/PLATFORM.md stage 24). It only sends what
// the tactic says, logs every message as a quest event, and stops (returning to the person) when unsure.
export class QuestTactics {
  private readonly chosen = new Map<string, Tactic>();
  private readonly runs = new Map<string, Run>();
  private readonly ownPrompts = new Set<string>(); // Owner prompts this tactic sent, not the person.
  // What the person wrote for a helper while forming the party; added to that helper's first tactic message.
  private readonly notes = new Map<string, Map<string, string>>();
  constructor(private readonly party: QuestParty) {}

  tactic(quest: string): Tactic {
    let tactic = this.chosen.get(quest);
    if (!tactic) {
      tactic = this.party.quests.get(quest)?.events.find((event) => event.kind === "tactic" && event.decision?.tactic)?.decision?.tactic ?? "obey";
      this.chosen.set(quest, tactic);
    }
    return tactic;
  }
  private members(quest: string): TacticMember[] {
    return this.party.quests.party(quest).map((member) => ({ ...member, cwd: this.party.pty.getSession(member.session)?.cwd,
      active: Boolean(this.party.pty.agentSession(member.session)?.active) }));
  }
  status(quest: string): TacticStatus {
    const tactic = this.tactic(quest), run = this.runs.get(quest), members = this.members(quest);
    const fits = Object.fromEntries(TACTICS.map((item) => [item, tacticFit(item, members)])) as Record<Tactic, ReturnType<typeof tacticFit>>, fit = fits[tactic];
    const running = Boolean(run && !run.stopped && !run.done && run.waiting.size);
    return { tactic, fit, fits, running, round: run?.round ?? 0, waiting: run?.waiting.size ?? 0, total: (run?.waiting.size ?? 0) + (run?.replies.size ?? 0), stopped: run?.stopped, done: run?.done };
  }
  choose(quest: string, tactic: Tactic, at = Date.now()): TacticStatus {
    if (this.status(quest).running && tactic !== "obey") throw new Error(tr("作戦で 進んでいる 間は 変えられない。先に「命令に従え」で 止める", "Stop the running tactic (Follow orders) before changing it"));
    if (!tacticFit(tactic, this.members(quest)).ok) throw new Error(tr("この 編成では 選べない", "This party cannot use that tactic"));
    this.chosen.set(quest, tactic); this.runs.delete(quest);
    this.party.quests.addEvent(quest, { kind: "tactic", at, title: tr(`作戦：${tacticLabel(tactic, "ja")}`, `Tactic: ${tacticLabel(tactic, "en")}`), decision: { tactic } });
    return this.status(quest);
  }
  // "Research first": the person's request goes to the researchers; the owner gets it with their reports.
  startResearch(quest: string, request: string, at = Date.now()): TacticStatus {
    if (this.tactic(quest) !== "research") throw new Error(tr("作戦が「調べてから」では ない", "The tactic is not Research first"));
    if (this.status(quest).running) throw new Error(tr("いま 調べている 最中", "Research is already running"));
    const fit = tacticFit("research", this.members(quest));
    if (!fit.ok) throw new Error(tr("この 編成では 調べられない", "This party cannot research"));
    const run: Run = { kind: "research", round: 1, waiting: new Set(), replies: new Map(), request };
    this.runs.set(quest, run);
    for (const session of fit.inside) {
      const note = this.takeNote(quest, session) ?? this.party.quests.member(session)?.note ?? "";
      try { this.party.send(quest, session, researchRequest(request, note, serverLanguage()), "tactic"); run.waiting.add(session); } catch { /* skip */ }
    }
    if (!run.waiting.size) this.stop(quest, tr("調べる役に 頼めなかった", "could not ask any researcher"), at);
    return this.status(quest);
  }
  forgetQuest(quest: string): void { this.chosen.delete(quest); this.runs.delete(quest); this.notes.delete(quest); }
  setNotes(quest: string, notes: Record<string, string>): void {
    const kept = this.notes.get(quest) ?? new Map<string, string>();
    for (const [session, text] of Object.entries(notes)) if (this.party.quests.member(session)?.quest === quest) kept.set(session, text);
    this.notes.set(quest, kept);
  }
  private takeNote(quest: string, session: string): string | undefined {
    const note = this.notes.get(quest)?.get(session); this.notes.get(quest)?.delete(session); return note;
  }

  observe(session: TerminalSession, event: AgentEvent, at: number): void {
    if (event.subagent) return;
    const member = this.party.quests.member(session.id);
    if (!member) return;
    const quest = member.quest, tactic = this.tactic(quest), name = this.party.label(session.id);
    if (tactic === "delegate") { this.relay(quest, session.id, member.role === "command", event); return; }
    const run = this.runs.get(quest);
    if (tactic === "review" && member.writer) { this.ownerEvent(quest, session.id, event, run, at); return; }
    if (!run || run.stopped || run.done || !run.waiting.has(session.id) || run.kind !== (tactic === "review" ? "review" : "research")) return;
    if (event.hook === "StopFailure") { this.stop(quest, tr(`${name}が 倒れた`, `${name} went down`), at); return; }
    if (event.hook === "SessionEnd") {
      run.waiting.delete(session.id);
      this.party.quests.addEvent(quest, { kind: "tactic", at, title: tr(`作戦：${name}が 去ったので 外した`, `Tactic: ${name} left and was dropped`) });
      if (!run.waiting.size) this.finish(quest, at);
      return;
    }
    if (event.hook !== "Stop") return;
    const text = event.text ?? "";
    if (run.kind === "review") {
      const verdict = parseVerdict(text);
      if (!verdict) { this.stop(quest, tr(`${name}の 判定が 読めない`, `could not read ${name}'s verdict`), at); return; }
      run.replies.set(session.id, { verdict, text });
    } else run.replies.set(session.id, { text });
    run.waiting.delete(session.id);
    if (!run.waiting.size) this.finish(quest, at);
  }

  private ownerEvent(quest: string, owner: string, event: AgentEvent, run: Run | undefined, at: number): void {
    if (event.hook === "UserPromptSubmit") {
      // A request from the person starts over; one the tactic sent continues the run.
      if (!this.ownPrompts.delete(owner)) this.runs.delete(quest);
      return;
    }
    if (event.hook === "StopFailure") { this.stop(quest, tr("担当が 倒れた", "the owner went down"), at); return; }
    if (event.hook === "SessionEnd") { this.stop(quest, tr("担当が 町を 去った", "the owner left town"), at); return; }
    if (event.hook !== "Stop" || run && (run.stopped || run.done || run.waiting.size)) return;
    // The owner reported: ask every reviewer in the owner's folder.
    const next: Run = { kind: "review", round: (run?.round ?? 0) + 1, waiting: new Set(), replies: new Map() };
    this.runs.set(quest, next);
    const fit = tacticFit("review", this.members(quest)), detail = this.party.quests.get(quest)!;
    const base = { title: detail.title, purpose: detail.purpose, folder: this.party.pty.getSession(owner)?.cwd };
    for (const reviewer of fit.inside) {
      const body = reviewRequest(base, event.text, next.round, serverLanguage(), this.takeNote(quest, reviewer));
      try { this.party.send(quest, reviewer, body, "tactic"); next.waiting.add(reviewer); } catch { /* A reviewer who cannot take messages is not waited for. */ }
    }
    if (!next.waiting.size) this.stop(quest, tr("担当と 同じ フォルダの レビュー役に 頼めなかった", "could not ask a reviewer in the owner's folder"), at);
  }
  private finish(quest: string, at: number): void {
    const run = this.runs.get(quest)!, owner = this.party.quests.party(quest).find((member) => member.writer);
    if (!run.replies.size) { this.stop(quest, tr("返事を した 仲間が いない", "no party member replied"), at); return; }
    if (!owner) { this.stop(quest, tr("担当が いない", "there is no owner"), at); return; }
    const replies = [...run.replies].map(([session, reply]) => ({ name: this.party.label(session), ...reply }));
    if (run.kind === "research") {
      run.done = true; this.sendOwner(quest, owner.session, researchedRequest(run.request ?? "", replies, serverLanguage()), at);
      return;
    }
    const changes = replies.filter((reply) => reply.verdict === "changes");
    if (!changes.length) {
      run.done = true;
      this.party.quests.addEvent(quest, { kind: "tactic", at, title: tr(`作戦：全員 OK（${run.round}回目）。報告を 見よう`, `Tactic: all reviewers OK (round ${run.round}). Read the report`) });
      return;
    }
    if (run.round >= REVIEW_ROUNDS) { this.stop(quest, tr(`差し戻しが ${REVIEW_ROUNDS}回に 達した`, `reached ${REVIEW_ROUNDS} rounds of changes`), at); return; }
    // The next owner report starts the next round.
    this.runs.set(quest, { kind: "review", round: run.round, waiting: new Set(), replies: new Map() });
    this.sendOwner(quest, owner.session, fixRequest(changes, run.round + 1, serverLanguage()), at);
  }
  private sendOwner(quest: string, owner: string, text: string, at: number): void {
    try { this.ownPrompts.add(owner); this.party.send(quest, owner, text, "tactic"); }
    catch { this.ownPrompts.delete(owner); this.stop(quest, tr("担当に 送れなかった", "could not send to the owner"), at); }
  }
  // "Leave it all": every other member's report goes to the commander, who decides what happens next.
  private relay(quest: string, session: string, commanding: boolean, event: AgentEvent): void {
    if (commanding || event.hook !== "Stop" || !event.text) return;
    const commander = this.party.quests.party(quest).find((member) => member.role === "command");
    if (!commander || !this.party.pty.agentSession(commander.session)?.active) return;
    try { this.party.send(quest, commander.session, relayToCommander(this.party.label(session), event.text, serverLanguage()), "tactic"); } catch { /* The report stays in the quest events. */ }
  }
  private stop(quest: string, reason: string, at: number): void {
    const run: Run = this.runs.get(quest) ?? { kind: "review", round: 0, waiting: new Set(), replies: new Map() };
    run.stopped = reason; run.waiting.clear(); this.runs.set(quest, run);
    this.party.quests.addEvent(quest, { kind: "tactic", at, title: tr(`作戦が 止まった：${reason}`, `Tactic stopped: ${reason}`) });
  }
}
