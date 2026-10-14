import type { AgentEvent } from "./events";

export type RecordedEvent = { event: AgentEvent; at: number };
export const EVENT_HISTORY_LIMIT = 2000;

// Choose one eviction without changing the history. Active heroes keep their arrival
// and newest main prompt. Counts include helpers, under their parent hero's ID.
export function historyDiscardIndex(history: readonly RecordedEvent[]): number {
  const heroes = new Map<string, { count: number; first: number; prompt: number; lifecycle: number; ended: boolean }>();
  history.forEach(({ event, at }, index) => {
    const id = event.agent ?? "default";
    const hero = heroes.get(id) ?? { count: 0, first: index, prompt: -1, lifecycle: -Infinity, ended: false };
    hero.count++;
    if (!event.subagent) {
      if (event.hook === "UserPromptSubmit" && (hero.prompt < 0 || at >= history[hero.prompt].at)) hero.prompt = index;
      if (["SessionStart", "SessionEnd"].includes(event.hook ?? "") && at >= hero.lifecycle) {
        hero.lifecycle = at;
        hero.ended = event.hook === "SessionEnd";
      }
    }
    heroes.set(id, hero);
  });
  let candidate = -1, largest = -1;
  history.forEach(({ event, at }, index) => {
    const hero = heroes.get(event.agent ?? "default")!;
    if (!hero.ended && (index === hero.first || index === hero.prompt)) return;
    if (hero.count > largest || (hero.count === largest && at < history[candidate].at)) {
      largest = hero.count;
      candidate = index;
    }
  });
  // More protected arrivals/prompts than the whole budget cannot all fit. Keep the
  // absolute memory bound even in that extreme (over 1000 active conversations).
  if (candidate >= 0) return candidate;
  return history.reduce((oldest, item, index) => item.at < history[oldest].at ? index : oldest, 0);
}
