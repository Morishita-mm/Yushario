import { randomUUID } from "node:crypto";
import type { AgentEvent } from "../core/events";
import { conversationText } from "../core/terminal-session";
import type { PartyRole } from "../core/party";
import { canRecallHero } from "../core/hook-trust";
import { finishedQuest, questForRecall, questStateAfterEvent, questStateForParty, questTitle, reportTitle, savedQuestEvent, type Quest, type QuestEvent, type QuestBinding, type QuestReportLink } from "../core/quests";
import { askingAfterEvent, staleSessionEnd } from "../core/session-actions";
import { forgetCheckFingerprint } from "./checks";
import { emptyTurns, recordTurn, type Turns } from "../core/turns";
import type { TerminalSession } from "./pty-session";
import { QuestDatabase } from "./quest-db";
import { reviewResult } from "./review";
import type { ReviewResult } from "../core/review-base";
import type { QuestDecision } from "../core/decisions";
import { serverLanguage, tr } from "./language";

export class QuestLedger {
  private readonly db = new QuestDatabase();
  readonly previews = this.db.previews;
  private readonly turns = new Map<string, Turns>();
  private readonly submitted = new Map<string, string[]>();
  private readonly latestAt = new Map<string, number>();
  private readonly waiting = new Map<string, boolean>();
  private closed = false;
  private notificationPending = false;
  private partyState(id: string, state: Quest["state"]): Quest["state"] {
    return questStateForParty(state, this.party(id).map((member) => this.waiting.get(member.session) === true));
  }
  forgetSession(session: string): void {
    this.turns.delete(session); this.cancelPending(session); this.latestAt.delete(session); this.waiting.delete(session);
    const quest = this.current(session);
    if (quest?.state === "waiting" && this.partyState(quest.id, "review") !== "waiting") this.patch(quest.id, { state: "review" });
  }
  answered(session: string, at = Date.now()): void {
    this.waiting.delete(session);
    const quest = this.current(session);
    if (!quest) return;
    this.latestAt.set(session, at);
    if (quest.state === "waiting") this.patch(quest.id, { state: "active" }, at);
  }
  private forgetQuest(id: string): void {
    for (const member of this.party(id)) this.forgetSession(member.session);
    forgetCheckFingerprint(this, id);
  }
  constructor(private readonly changed: (message: { type: "quests"; quests: Quest[]; bindings: QuestBinding[]; reports: QuestReportLink[] }) => void,
    private readonly keepText: () => boolean, private readonly clearHeld: (session: string) => void = () => {}) {}
  cancelPending(session: string): void { this.submitted.delete(session); this.clearHeld(session); }
  // `members`: which quest each terminal is in and its role, for the hero list.
  snapshot() {
    return { type: "quests" as const, quests: this.db.list(), bindings: this.db.bindings(), reports: [] as QuestReportLink[],
      members: this.db.party.all().map(({ session, quest, role, writer }) => ({ session, quest, role, writer })) };
  }
  list(): Quest[] { return this.db.list(); }
  get(id: string) { return this.db.get(id); }
  summary(id: string) { return this.db.summary(id); }
  reportsAfter(session: string, at: number) { return this.db.reportsAfter(session, at); }
  reportLink(hero: string, at: number) { return this.db.reportLink(hero, at); }
  recentReports() { return this.db.recentReports(); }
  reportQuest(session: string, at: number) { return this.db.reportQuest(session, at); }
  get checks() { return this.db.checks; }
  checksChanged(): void { this.notify(); }
  party(id: string) { return this.db.party.list(id); }
  member(session: string) { return this.db.party.member(session); }
  sessionForHero(hero: string): string | undefined { return this.db.bindings().find((binding) => binding.hero === hero)?.session; }
  join(id: string, session: TerminalSession, role: PartyRole, note = "", writer?: boolean, hero?: string, at = Date.now()): void {
    const quest = this.db.summary(id);
    if (!quest || quest.town !== session.project) throw new Error(tr("この町の 勇者を えらんで", "Choose a hero in this town"));
    const previous = this.member(session.id), wasWaiting = this.waiting.get(session.id);
    if (previous && previous.quest !== id) { this.forgetSession(session.id); forgetCheckFingerprint(this, previous.quest); }
    forgetCheckFingerprint(this, id);
    this.db.party.put({ quest: id, session: session.id, hero: hero ?? session.hero ?? previous?.hero, role, note,
      writer: writer ?? (previous?.quest === id ? previous.writer : role === "implement" && !this.party(id).some((item) => item.writer)),
      joinedAt: previous?.quest === id ? previous.joinedAt : at });
    if (wasWaiting) this.waiting.set(session.id, true);
    if (this.partyState(id, quest.state) !== quest.state) this.patch(id, { state: "waiting" }, at);
    if (!quest.worktreePath && role === "implement") this.db.update({ ...this.db.summary(id)!, worktreePath: session.cwd, worktreeBranch: session.branch });
    this.addEvent(id, { kind: "party", at, title: tr("パーティーを かえた", "Party updated"), session: session.id, hero });
  }
  // Leaves the party only; the hero's terminal keeps running.
  leave(id: string, session: string, at = Date.now()): void {
    const member = this.member(session);
    if (member?.quest !== id) return;
    this.forgetSession(session); this.db.party.remove(session); forgetCheckFingerprint(this, id);
    this.addEvent(id, { kind: "party", at, title: tr("パーティーから はずれた", "Left the party"), session, hero: member.hero });
  }
  current(session: string): Quest | undefined {
    const member = this.member(session);
    return member ? this.db.summary(member.quest) : undefined;
  }
  private notify(): void {
    if (this.notificationPending || this.closed) return;
    this.notificationPending = true;
    queueMicrotask(() => {
      this.notificationPending = false;
      if (!this.closed) this.changed(this.snapshot());
    });
  }
  create(town: string, title: string, purpose = "", at = Date.now(), id: string = randomUUID()): Quest {
    const quest: Quest = { id, town, title: title.trim(), purpose, state: "open", createdAt: at, updatedAt: at };
    this.db.save(quest); this.notify(); return quest;
  }
  patch(id: string, patch: Partial<Pick<Quest, "title" | "purpose" | "state">>, at = Date.now()): Quest {
    const previous = this.db.summary(id);
    if (!previous) throw new Error(tr("クエストが みつからない", "Quest not found"));
    const quest: Quest = { ...previous, ...patch, state: this.partyState(id, patch.state ?? previous.state), updatedAt: at };
    this.db.update(quest);
    if (quest.state !== previous.state) this.db.add({ quest: id, kind: "state", at, title: quest.state });
    if (patch.state && finishedQuest(patch.state)) for (const member of this.party(id)) this.cancelPending(member.session);
    this.notify(); return quest;
  }
  assign(id: string, session: TerminalSession, hero?: string, at = Date.now()): void {
    const quest = this.db.summary(id);
    if (!quest || quest.town !== session.project) throw new Error(tr("この町の クエストを えらんで", "Choose a quest in this town"));
    const member = this.member(session.id);
    const previousWriter = this.party(id).find((item) => item.writer && item.session !== session.id);
    this.join(id, session, "implement", member?.quest === id ? member.note : "", true, hero, at);
    if (previousWriter?.role === "implement") this.db.party.put({ ...previousWriter, role: "research", writer: false });
    // A new owner has not been told anything yet; the old owner's work state must not carry over.
    const now = this.db.summary(id)!;
    if (quest.session !== session.id && (now.state === "active" || now.state === "waiting") && !this.waiting.get(session.id)) this.patch(id, { state: "open" }, at);
    this.db.add({ quest: id, kind: "assigned", title: tr("勇者が ついた", "Hero assigned"), at, session: session.id, hero, result: { cwd: session.cwd } });
    this.setWorktree(id, { path: session.cwd, branch: session.branch }, at);
  }
  addEvent(id: string, event: Omit<QuestEvent, "id" | "quest">): number | undefined {
    const quest = this.db.summary(id);
    if (!quest) return;
    const eventId = this.db.add(savedQuestEvent({ ...event, quest: id }, this.keepText()));
    this.db.update({ ...quest, updatedAt: Math.max(quest.updatedAt, event.at) }); this.notify();
    return eventId;
  }
  setWorktree(id: string, base: { path: string; branch?: string } | undefined, at = Date.now()): void {
    const quest = this.db.summary(id);
    if (!quest) throw new Error(tr("クエストが みつからない", "Quest not found"));
    forgetCheckFingerprint(this, id);
    this.db.update({ ...quest, worktreePath: base?.path, worktreeBranch: base?.branch, updatedAt: at }); this.notify();
  }
  clearWorktree(id: string): void { this.setWorktree(id, undefined); }
  foldedWorktree(path: string): void {
    for (const quest of this.db.list()) if (quest.worktreePath === path) this.clearWorktree(quest.id);
  }
  reviewed(session: string, at: number, questId?: string): void {
    const quest = questId ? this.get(questId) : this.current(session);
    // Opening the window is not reading everything or approving it.
    if (quest) this.addEvent(quest.id, { kind: "reviewed", at, title: tr("かんていを ひらいた", "Opened review"), session: session || undefined, hero: quest.hero });
  }
  verdict(session: string, questId: string | undefined, result: ReviewResult, decision: QuestDecision, at = Date.now()): boolean {
    const quest = questId ? this.get(questId) : this.current(session);
    if (!quest) return false;
    const title = decision.verdict === "approved" ? tr("鑑定：OKと 記録", "Review: recorded as OK") : tr("鑑定：要修正と 記録", "Review: recorded as needing changes");
    this.addEvent(quest.id, { kind: "verdict", at, title, session: session || undefined, hero: quest.hero, result, decision });
    return true;
  }
  // Records exactly which base state was accepted, then marks the quest done. Not a merge.
  adopt(id: string, result: ReviewResult | undefined, decision: QuestDecision, at = Date.now()): Quest {
    if (!this.addEvent(id, { kind: "adopted", at, title: tr("採用した", "Adopted"), result, decision })) throw new Error(tr("クエストが みつからない", "Quest not found"));
    return this.patch(id, { state: "done" }, at);
  }
  requested(session: TerminalSession, text: string, at = Date.now(), hero?: string): void {
    let quest = this.current(session.id);
    if (!quest || finishedQuest(quest.state)) {
      quest = this.create(session.project, questTitle(text), "", at); this.assign(quest.id, session, hero, at);
    }
    this.addEvent(quest.id, { kind: "request", title: questTitle(text), text, at, session: session.id, hero });
    this.submittedText(session.id, text);
  }
  submittedText(session: string, text: string): void {
    const pending = this.submitted.get(session) ?? [];
    pending.push(conversationText(text)); this.submitted.set(session, pending);
  }
  observe(session: TerminalSession, event: AgentEvent, at: number, terminalEnded: (id: string) => boolean = () => false): void | false {
    const previousAt = this.latestAt.get(session.id);
    if (staleSessionEnd(event, at, previousAt)) return false;
    this.latestAt.set(session.id, Math.max(at, previousAt ?? -Infinity));
    if (event.hook === "SessionEnd" && !event.subagent) { this.forgetSession(session.id); return; }
    let quest = this.current(session.id);
    if (event.hook === "SessionStart" && !event.subagent) {
      if (this.member(session.id)?.hero && this.member(session.id)?.hero !== event.agent) { this.forgetSession(session.id); this.db.party.remove(session.id); quest = undefined; }
      if (!quest && event.agent && session.recalledHero === event.agent) {
        const old = questForRecall(this.db.list(), this.db.bindings(), event.agent, session.project);
        const recalled = old && this.party(old.id).find((member) => member.hero === event.agent);
        if (old && recalled && canRecallHero(session.recalledHero, event.agent, terminalEnded(recalled.session))) {
          this.db.party.remove(recalled.session); this.db.party.put({ ...recalled, session: session.id });
          this.addEvent(old.id, { kind: "assigned", at, title: tr("勇者が ついた", "Hero assigned"), session: session.id, hero: event.agent, result: { cwd: session.cwd } });
          quest = this.current(session.id);
        }
      }
    }
    if (event.hook === "UserPromptSubmit" && !event.subagent) {
      const pending = this.submitted.get(session.id) ?? [];
      const text = conversationText(event.text ?? "…");
      const matching = pending.findIndex((item) => item === text || text.includes(item));
      if (matching >= 0) pending.splice(0, matching + 1);
      else this.requested(session, text, at, event.agent);
      // A direct terminal request is already delivered: it must not stay in the pending de-duplication list.
      if (matching < 0) this.submitted.get(session.id)?.pop();
      quest = this.current(session.id);
    }
    if (!quest) return;
    const member = this.member(session.id);
    if (!event.subagent && event.agent && member && member.hero !== event.agent) {
      this.db.party.put({ ...member, hero: event.agent }); quest = this.current(session.id)!;
    }
    if (at >= (previousAt ?? -Infinity)) {
      const asking = askingAfterEvent(event);
      if (asking !== undefined) this.waiting.set(session.id, asking);
      const state = this.partyState(quest.id, questStateAfterEvent(quest.state, event));
      if (state !== quest.state) this.patch(quest.id, { state }, at);
      this.latestAt.set(session.id, at);
    }
    if (event.subagent) return;
    const turns = this.turns.get(session.id) ?? emptyTurns();
    this.turns.set(session.id, turns); recordTurn(turns, event, at);
    if (event.hook === "Stop" || event.hook === "StopFailure") {
      const report = turns.updates.get(at);
      const questId = quest.id, eventId = this.addEvent(questId, { kind: "report", title: reportTitle(report, serverLanguage()), at,
        session: session.id, hero: event.agent, report, text: event.text, result: { cwd: session.cwd } });
      // Save and broadcast the report first. Slow Git must never delay the hook.
      if (eventId !== undefined) void reviewResult(session.cwd).then((result) => {
        if (!this.closed && this.db.attachResult(eventId, questId, session.id, at, result)) this.notify();
      }).catch(() => undefined);
    }
    for (const [endedAt, report] of turns.updates) if (report && endedAt !== at) {
      this.db.correctReport(session.id, endedAt, report, reportTitle(report, serverLanguage())); this.notify();
    }
  }
  delete(id: string): void { this.forgetQuest(id); this.db.delete(id); this.notify(); }
  clear(town?: string): void {
    for (const quest of this.list()) if (!town || quest.town === town) this.forgetQuest(quest.id);
    this.db.clear(town); this.previews.clearTown(town); this.notify();
  }
  close(): void { this.closed = true; this.db.close(); }
}
