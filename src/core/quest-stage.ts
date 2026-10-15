import type { QuestEvent, QuestState } from "./quests";

// Where a quest is in the person's flow (docs/PLATFORM.md stage 22):
// assign → send → work → review → done, with "waiting" when the hero needs an answer.
// It is read from the saved state and owner; nothing new is stored.
export type QuestStage = "assign" | "send" | "work" | "waiting" | "review" | "done" | "dropped";
export const QUEST_STEPS = ["write", "assign", "send", "work", "review", "accept"] as const;

// ownerHere: whether the owner is still in town. A restart can leave a saved owner who already left.
export function questStage(quest: { state: QuestState; session?: string; hero?: string }, ownerHere = true): QuestStage {
  const owned = Boolean(quest.session || quest.hero) && ownerHere;
  if (quest.state === "done" || quest.state === "dropped" || quest.state === "review") return quest.state;
  // Work or a question without a hero means the hero left; someone must take it over.
  if (!owned) return "assign";
  if (quest.state === "waiting") return "waiting";
  // A quest stays "open" from creation until its hero receives the first request.
  return quest.state === "active" ? "work" : "send";
}
export const yourTurn = (stage: QuestStage): boolean => stage === "assign" || stage === "send" || stage === "waiting" || stage === "review";
// The index of the current step in QUEST_STEPS; everything before it is finished.
export function stepIndex(stage: QuestStage): number {
  return { assign: 1, send: 2, work: 3, waiting: 3, review: 4, done: 6, dropped: 6 }[stage];
}
// Each report closes one round of work; a hero working now is on the next round.
export function questRound(events: readonly Pick<QuestEvent, "kind">[], stage: QuestStage): number {
  const reports = events.filter((event) => event.kind === "report").length;
  return reports + (stage === "work" || stage === "waiting" ? 1 : 0);
}
// The hero who held the quest before the current one, from the newest assignment or handoff.
export function previousHero(events: readonly Pick<QuestEvent, "kind" | "hero" | "at">[], current: string | undefined): string | undefined {
  const owners = events.filter((event) => (event.kind === "assigned" || event.kind === "handoff") && event.hero)
    .sort((a, b) => b.at - a.at).map((event) => event.hero!);
  if (!current || owners[0] !== current) return;
  return owners.find((hero) => hero !== current);
}
