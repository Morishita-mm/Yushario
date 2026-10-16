import { truncateEventString, type AgentEvent } from "./events";
import { askingAfterEvent } from "./session-actions";
import type { TalkReport } from "./turns";
import type { Language } from "./town-ledger";
import type { QuestCheck, WorkFingerprint, CheckEvidence } from "./checks";

export const QUEST_STATES = ["open", "active", "waiting", "review", "done", "dropped"] as const;
export type QuestState = typeof QUEST_STATES[number];
// town is the town key, not its display name; JSON/storage keep the existing field name.
export type Quest = { id: string; town: string; title: string; purpose: string; state: QuestState; createdAt: number; updatedAt: number; session?: string; hero?: string; writerSession?: string; worktreePath?: string; worktreeBranch?: string; checks?: QuestCheck[]; fingerprint?: WorkFingerprint };
export type QuestEvent = { id: number; quest: string; kind: "request" | "report" | "state" | "assigned" | "reviewed" | "party" | "handoff" | "command" | "note" | "outside-role" | "check" | "verdict" | "adopted" | "tactic"; at: number; title: string; session?: string; hero?: string; report?: TalkReport; text?: string; evidence?: CheckEvidence; result?: import("./review-base").ReviewResult; decision?: import("./decisions").QuestDecision };
export type QuestDetail = Quest & { events: QuestEvent[] };
export type QuestBinding = { session: string; quest: string; hero?: string };
export type QuestReportLink = { hero: string; at: number; title: string };
export function savedQuestEvent(event: Omit<QuestEvent, "id">, keepText: boolean): Omit<QuestEvent, "id"> {
  const { text, ...summary } = event;
  return keepText && text !== undefined ? { ...summary, text } : summary;
}
export const questTitle = (text: string): string => truncateEventString(text.split(/\r?\n/)[0], 60).trim() || "…";
export function questForRecall(quests: Quest[], bindings: QuestBinding[], hero: string, town: string): Quest | undefined {
  const linked = bindings.find((binding) => binding.hero === hero && quests.some((quest) => quest.id === binding.quest && quest.town === town));
  return linked ? quests.find((quest) => quest.id === linked.quest)
    : [...quests].filter((quest) => quest.hero === hero && quest.town === town).sort((a, b) => b.updatedAt - a.updatedAt)[0];
}
export const finishedQuest = (state: QuestState): boolean => state === "done" || state === "dropped";
// A teammate's activity/report cannot answer another session's question.
export function questStateForParty(state: QuestState, waiting: Iterable<boolean>): QuestState {
  return !finishedQuest(state) && [...waiting].some(Boolean) ? "waiting" : state;
}
export function questStateAfterEvent(state: QuestState, event: AgentEvent): QuestState {
  if (finishedQuest(state)) return state;
  if (event.subagent) return askingAfterEvent(event) === true ? "waiting" : state;
  if (event.hook === "Stop" || event.hook === "StopFailure") return "review";
  if (askingAfterEvent(event) === true) return "waiting";
  if (event.hook === "UserPromptSubmit" || event.hook === "PreToolUse" || event.hook === "PostToolUse" || event.hook === "PostToolUseFailure") return "active";
  return state;
}
export function reportTitle(report: TalkReport | undefined, language: Language): string {
  const en = language === "en";
  if (!report) return en ? "A reply arrived" : "へんじが とどいた";
  if (report.stopFailure) return en ? "Went down partway…" : "とちゅうで たおれた…";
  const count = report.files.length;
  if (report.tests.last === "failed") return en ? `Changed ${count} files. Tests failed` : `ファイル ${count}つを かえた。テストは しっぱい`;
  if (count && report.tests.passed + report.tests.failed === 0) return en ? `Changed ${count} files. Not tested yet` : `ファイル ${count}つを かえた。まだ ためしていない`;
  if (count && report.tests.last === "passed") return en ? `Victory! Files fixed: ${count}` : `しょうり！ ファイル ${count}つを なおした`;
  return report.kind === "scroll" ? (en ? "Returned from exploring" : "しらべて もどってきた") : (en ? "Came to talk" : "はなしかけてきた");
}
export function sortedQuests(quests: Quest[]): Quest[] {
  const order: QuestState[] = ["waiting", "review", "active", "open", "done", "dropped"];
  return [...quests].sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state) || b.updatedAt - a.updatedAt);
}
export function validQuestPatch(input: unknown): input is { title?: string; purpose?: string; state?: QuestState } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>;
  return Object.keys(value).every((key) => ["title", "purpose", "state"].includes(key))
    && (value.title === undefined || typeof value.title === "string" && value.title.trim().length > 0 && value.title.length <= 200)
    && (value.purpose === undefined || typeof value.purpose === "string" && value.purpose.length <= 2000)
    && (value.state === undefined || QUEST_STATES.includes(value.state as QuestState));
}

// The answer an adoption keeps: the current owner's reply, never a commander's or helper's.
// `reply`: the last reply held in memory with the terminal that wrote it; else the owner's latest saved report.
export function ownerAnswer(quest: QuestDetail, reply?: { session: string; text: string }): string | undefined {
  const owner = quest.writerSession ?? quest.session;
  if (!owner) return undefined;
  if (reply?.session === owner) return reply.text;
  return quest.events.filter((event) => event.kind === "report" && event.session === owner && event.text !== undefined)
    .sort((a, b) => b.at - a.at || b.id - a.id)[0]?.text;
}
