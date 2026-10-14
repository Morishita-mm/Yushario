import { describe, expect, it } from "vitest";
import { downAfterEvent, Room } from "./room";

const fallen = { at: 10, active: true };
describe("a hero who went down", () => {
  it("marks even a textless StopFailure and keeps it through ordinary progress and time", () => {
    const room = new Room();
    const hero = room.apply({ state: "error", hook: "StopFailure", agent: "a" }, 10)!;
    expect(hero.down).toEqual(fallen);
    room.apply({ state: "success", hook: "Stop", agent: "a" }, 20);
    room.apply({ state: "idle", hook: "Notification", agent: "a" }, 1_000_000);
    expect(hero.down).toEqual(fallen);
  });
  it("clears only on a main request or departure, independently for each hero", () => {
    const room = new Room();
    const a = room.apply({ state: "error", hook: "StopFailure", agent: "a" }, 10)!;
    const b = room.apply({ state: "error", hook: "StopFailure", agent: "b" }, 11)!;
    room.apply({ state: "thinking", hook: "UserPromptSubmit", agent: "a" }, 20);
    expect(a.down).toEqual({ at: 20, active: false });
    expect(b.down?.active).toBe(true);
    room.apply({ state: "idle", hook: "SessionEnd", agent: "b" }, 30);
    expect(room.agents.has("b")).toBe(false);
  });
  it("ignores helper failures and helper prompts", () => {
    const helper = { id: "h1" };
    expect(downAfterEvent(undefined, { state: "error", hook: "StopFailure", subagent: helper }, 10)).toBeUndefined();
    expect(downAfterEvent(fallen, { state: "thinking", hook: "UserPromptSubmit", subagent: helper }, 20)).toBe(fallen);
  });
  it("ignores a late failure before the latest request and a late request before a fall", () => {
    const recovered = downAfterEvent(fallen, { state: "thinking", hook: "UserPromptSubmit" }, 20);
    expect(downAfterEvent(recovered, { state: "error", hook: "StopFailure" }, 15)).toBe(recovered);
    expect(downAfterEvent(fallen, { state: "thinking", hook: "UserPromptSubmit" }, 5)).toBe(fallen);
  });
});
