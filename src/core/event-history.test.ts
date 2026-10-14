import { describe, expect, it } from "vitest";
import { EVENT_HISTORY_LIMIT, historyDiscardIndex, type RecordedEvent } from "./event-history";
import { Room } from "./room";

const event = (agent: string, at: number, hook = "PostToolUse"): RecordedEvent => ({ at, event: { agent, state: "working", hook } });
function append(history: RecordedEvent[], item: RecordedEvent): void {
  history.push(item);
  if (history.length > EVENT_HISTORY_LIMIT) history.splice(historyDiscardIndex(history), 1);
}

describe("fair, bounded replay history", () => {
  it("keeps a quiet hero and its conversation after another hero sends 2001 events", () => {
    const history: RecordedEvent[] = [event("a", 0, "SessionStart"),
      { at: 1, event: { agent: "a", project: "Town A", state: "thinking", hook: "UserPromptSubmit", text: "Quiet quest" } },
      { at: 2, event: { agent: "a", state: "success", hook: "Stop", text: "Quiet reply" } },
      event("b", 3, "SessionStart"), event("b", 4, "UserPromptSubmit")];
    const quiet = history.slice(0, 3);
    for (let i = 0; i < 2001; i++) append(history, event("b", i + 5));
    expect(history).toHaveLength(EVENT_HISTORY_LIMIT);
    expect(history.slice(0, 3)).toEqual(quiet);
    expect(history.some((item) => item.event.agent === "b" && item.event.hook === "UserPromptSubmit")).toBe(true);
    const room = new Room();
    for (const item of history) room.apply(item.event, item.at);
    expect([...room.agents.keys()]).toEqual(["a", "b"]);
    expect(room.agents.get("a")!.talk.map((item) => item.text)).toEqual(["Quiet quest", "Quiet reply"]);
  });
  it("drops the oldest unprotected event of the most represented hero, without mutation", () => {
    const history = [event("a", 0, "SessionStart"), event("a", 1), event("b", 2, "SessionStart"),
      event("b", 3), event("b", 4, "UserPromptSubmit"), event("b", 5)];
    const copy = structuredClone(history);
    expect(historyDiscardIndex(history)).toBe(3);
    expect(history).toEqual(copy);
  });
  it("breaks count ties by the oldest candidate's clock", () => {
    expect(historyDiscardIndex([event("a", 0), event("b", 1), event("a", 5), event("b", 3)])).toBe(3);
  });
  it("protects only the latest main prompt (event time), not old or helper prompts", () => {
    const history = [event("a", 0, "SessionStart"), event("a", 5, "UserPromptSubmit"), event("a", 2, "UserPromptSubmit")];
    expect(historyDiscardIndex(history)).toBe(2);
    history[2].event.subagent = { id: "h" };
    expect(historyDiscardIndex(history)).toBe(2);
  });
  it("counts helpers with their parent and handles missing IDs", () => {
    const history = [event("a", 0), event("b", 1), event("a", 2), event("a", 3)];
    history[2].event.subagent = { id: "h" };
    expect(historyDiscardIndex(history)).toBe(2);
    expect(historyDiscardIndex([{ at: 0, event: { state: "idle" } }, { at: 1, event: { state: "thinking" } }])).toBe(1);
  });
  it("unpins ended heroes, keeps SessionEnd until earlier events are gone, and recognizes a new session", () => {
    const history = [event("a", 0, "SessionStart"), event("a", 1, "UserPromptSubmit"), event("a", 2, "SessionEnd")];
    expect(historyDiscardIndex(history)).toBe(0);
    history.splice(0, 1); expect(historyDiscardIndex(history)).toBe(0);
    history.push(event("a", 3, "SessionStart"), event("a", 4, "UserPromptSubmit"));
    expect(historyDiscardIndex(history)).toBe(1);
  });
  it("uses an absolute-bound fallback when every slot is protected", () => {
    expect(historyDiscardIndex([event("a", 0), event("b", 1)])).toBe(0);
    expect(historyDiscardIndex([event("a", 5), event("b", 1)])).toBe(1);
  });
});
