import { randomUUID } from "node:crypto";
import type { AgentEvent } from "../core/events";
import { agentAuthorized, outsideRole, partyEditFiles, type PartyRole } from "../core/party";
import type { QuestEvent } from "../core/quests";
import type { QuestLedger } from "./quest-ledger";
import type { createPtyServer } from "./pty";
import type { TerminalSession } from "./pty-session";
import { tr } from "./language";
import { projectIdentity } from "./project";
import { AGENTS, type Preset } from "./agents";

export class TerminalOnlyError extends Error {
  constructor() { super(tr("ターミナルのみ。町での会話に 対応しないため ことばを 届けられない", "Terminal only. This CLI cannot receive town conversations")); }
}
export function requirePartyConversation(preset: string): void {
  if (!AGENTS[preset as Preset]?.hero) throw new TerminalOnlyError();
}

export type PartyInvite = { id: string; quest: string; town: string; from: string; role: PartyRole; note: string; session?: string; preset?: string; cwd?: string; at: number };
export type PartyWarning = { id: string; quest: string; town: string; hero: string; at: number; count?: number };
export class QuestParty {
  private readonly invitations = new Map<string, PartyInvite>();
  private readonly warnings = new Map<string, PartyWarning>();
  private readonly warned = new Set<string>();
  private readonly turnStarts = new Map<string, number>();
  private readonly observedEdits = new Set<string>();
  private readonly requests = new Map<string, { text: string; detail?: string }[]>();
  private readonly replies = new Map<string, { at: number; text: string }>();
  latestReply(quest: string): string | undefined { return this.quests.summary(quest) ? this.replies.get(quest)?.text : undefined; }
  constructor(readonly quests: QuestLedger, readonly pty: ReturnType<typeof createPtyServer>,
    private readonly broadcast: (value: object) => void, private readonly record: (event: AgentEvent) => void,
    private readonly name: (id: string) => string | undefined) {}
  label(session: string): string { const hero = this.quests.member(session)?.hero; return hero && this.name(hero) || this.pty.sessionLabel(session) || session; }
  forgetSession(session: string): void {
    this.turnStarts.delete(session); this.requests.delete(session);
    for (const key of this.observedEdits) if (key.startsWith(`${session}:`)) this.observedEdits.delete(key);
    for (const key of this.warned) if (key.startsWith(`${session}:`)) this.warned.delete(key);
    for (const key of this.warnings.keys()) if (key.startsWith(`${session}:`)) this.warnings.delete(key);
    for (const [id, invite] of this.invitations) if (invite.from === session || invite.session === session) this.invitations.delete(id);
  }
  prune(knownQuests?: Set<string>): void {
    const exists = (id: string) => knownQuests ? knownQuests.has(id) : Boolean(this.quests.summary(id));
    for (const quest of this.replies.keys()) if (!exists(quest)) this.replies.delete(quest);
    const sessions = new Set([...this.turnStarts.keys(), ...this.requests.keys(), ...[...this.observedEdits, ...this.warned].map((key) => key.slice(0, key.lastIndexOf(":")))]);
    for (const session of sessions) if (!this.quests.member(session)) this.forgetSession(session);
    for (const [id, warning] of this.warnings) if (!exists(warning.quest)) this.warnings.delete(id);
  }
  private trimTurns(session: string): void {
    const keys = [...new Set([...this.observedEdits, ...this.warned])].filter((key) => key.startsWith(`${session}:`))
      .sort((a, b) => Number(b.slice(session.length + 1)) - Number(a.slice(session.length + 1)));
    for (const key of keys.slice(256)) { this.observedEdits.delete(key); this.warned.delete(key); }
  }
  snapshot() {
    this.prune();
    for (const [id, invite] of this.invitations) if (!this.quests.summary(invite.quest) || !agentAuthorized(true, Boolean(this.pty.agentSession(invite.from)?.active), this.quests.member(invite.from), invite.quest, "invite")) this.invitations.delete(id);
    return { type: "party-notices", invitations: [...this.invitations.values()], warnings: [...this.warnings.values()] };
  }
  private changed(): void { this.broadcast(this.snapshot()); }
  invite(input: Omit<PartyInvite, "id" | "at" | "town">): PartyInvite {
    if (this.invitations.size >= 32) throw new Error(tr("さきに でんれいに こたえて", "Answer the herald first"));
    const quest = this.quests.summary(input.quest);
    if (!quest) throw new Error(tr("クエストが みつからない", "Quest not found"));
    const invite = { ...input, id: randomUUID(), at: Date.now(), town: quest.town };
    this.invitations.set(invite.id, invite); this.changed(); return invite;
  }
  async decide(id: string, yes: boolean): Promise<{ session?: TerminalSession }> {
    this.snapshot();
    const invite = this.invitations.get(id);
    if (!invite) throw new Error(tr("この よびかけは おわった", "This invitation has ended"));
    this.invitations.delete(id); this.changed();
    if (!yes) {
      this.quests.addEvent(invite.quest, { kind: "party", at: Date.now(), title: tr("仲間の よびかけを ことわった", "Invitation declined"), session: invite.from }); return {};
    }
    // No PTY is created until yes; validate scope again if the folder moved while awaiting a human.
    if (!invite.session && (!invite.cwd || (await projectIdentity(invite.cwd)).key !== invite.town)) throw new Error(tr("この町の 拠点を えらんで", "Choose a base in this town"));
    const authorized = () => agentAuthorized(true, Boolean(this.pty.agentSession(invite.from)?.active), this.quests.member(invite.from), invite.quest, "invite");
    if (!authorized()) throw new Error(tr("この よびかけは おわった", "This invitation has ended"));
    const session = invite.session ? this.pty.getSession(invite.session) : await this.pty.create({ preset: invite.preset, cwd: invite.cwd });
    if (!session || !this.pty.agentSession(session.id)?.active || session.project !== invite.town || !authorized()) {
      if (session && !invite.session) this.pty.end(session.id);
      throw new Error(tr("この町の 勇者を えらんで", "Choose a hero in this town"));
    }
    this.quests.join(invite.quest, session, invite.role, invite.note);
    return { session };
  }
  send(quest: string, session: string, text: string, kind: "request" | "command" | "handoff" = "request", from?: string): boolean {
    if (!text.trim() || text.length > 8000) throw new Error(tr("ことばは 1〜8000文字で", "Use 1–8000 characters"));
    if (this.quests.member(session)?.quest !== quest || !this.pty.agentSession(session)?.active) throw new Error(tr("パーティーの 勇者を えらんで", "Choose a party hero"));
    const info = this.pty.getSession(session);
    if (!info) throw new Error(tr("勇者が みつからない", "Hero not found"));
    requirePartyConversation(info.preset);
    const delivered = this.pty.say(session, text);
    this.quests.submittedText(session, text);
    const at = Date.now(), hero = this.quests.member(session)?.hero;
    const title = from ? tr(`しき ${this.label(from)}から`, `From commander ${this.label(from)}`)
      : kind === "handoff" ? tr("ひきつぎの 巻物", "Handoff scroll") : tr("あなたから", "From you");
    this.quests.addEvent(quest, { kind, title, at, session, hero, text });
    const request = { detail: from ? this.label(from) : undefined, text };
    if (hero) this.record({ state: "idle", hook: "PartyRequest", terminal: session, agent: hero, ...request });
    else this.requests.set(session, [...(this.requests.get(session) ?? []), request]);
    return delivered;
  }
  observe(session: TerminalSession, event: AgentEvent, at: number): void {
    if (event.hook === "SessionEnd" && !event.subagent) { this.forgetSession(session.id); this.changed(); return; }
    const member = this.quests.member(session.id);
    if (event.hook === "SessionStart" && !event.subagent && member?.hero) {
      const requests = this.requests.get(session.id) ?? []; this.requests.delete(session.id);
      for (const request of requests) this.record({ state: "idle", hook: "PartyRequest", terminal: session.id, agent: member.hero, ...request });
    }
    if (!event.subagent && event.hook === "UserPromptSubmit") this.turnStarts.set(session.id, at);
    if (!event.subagent && event.hook === "SessionStart") this.turnStarts.delete(session.id);
    const start = this.turnStarts.get(session.id), files = event.subagent ? [] : partyEditFiles(event);
    if (member && start !== undefined && at >= start && files.length) {
      this.observedEdits.add(`${session.id}:${start}`); this.trimTurns(session.id);
      this.warn(member.writer, { quest: member.quest, at, hero: member.hero, report: { files, startedAt: start } }, session);
    }
    if (member && !event.subagent && ["Stop", "StopFailure"].includes(event.hook ?? "") && event.text !== undefined && at >= (this.replies.get(member.quest)?.at ?? -Infinity)) this.replies.set(member.quest, { at, text: event.text });
    if (!member || event.subagent || !["Stop", "StopFailure", "PostToolUse", "PostToolUseFailure"].includes(event.hook ?? "")) return;
    if (member.writer) return;
    for (const report of this.quests.reportsAfter(session.id, at)) {
      if (!this.observedEdits.has(`${session.id}:${report.report?.startedAt}`)) this.warn(member.writer, report, session);
    }
  }
  private warn(writer: boolean, report: Pick<QuestEvent, "quest" | "at" | "hero"> & { report?: { files: string[]; startedAt: number } }, session: TerminalSession): void {
    const key = `${session.id}:${report.report?.startedAt ?? report.at}`;
    if (!outsideRole({ ...this.quests.member(session.id)!, writer }, report.report?.files ?? []) || this.warned.has(key)) return;
    this.warned.add(key); this.trimTurns(session.id);
    const hero = report.hero ?? session.id;
    // One unread payload per live terminal (at most 16), without losing the
    // number of warnings. Every individual fact remains in the quest ledger.
    const previous = [...this.warnings.values()].find((warning) => warning.id.startsWith(`${session.id}:`));
    const id = previous?.id ?? key;
    this.warnings.set(id, { id, quest: report.quest, town: session.project, hero, at: report.at,
      count: Math.min(Number.MAX_SAFE_INTEGER, (previous?.count ?? 0) + 1) });
    this.quests.addEvent(report.quest, { kind: "outside-role", at: report.at, session: session.id, hero,
      title: tr(`${this.name(hero) ?? hero}が やくわりの そとで ファイルを かえた`, `${this.name(hero) ?? hero} changed files outside their role`) });
    this.changed();
  }
  dismiss(id: string): void { this.warnings.delete(id); this.changed(); }
}
