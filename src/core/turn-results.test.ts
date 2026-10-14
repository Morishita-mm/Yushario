import { describe, expect, it } from "vitest";
import { Room } from "./room";
import { emptyTurns, recordTurn, TURN_MARK_LIMIT } from "./turns";

function editingRoom(): Room {
  const room = new Room();
  room.apply({ state: "thinking", hook: "UserPromptSubmit", text: "Fix it" }, 0);
  room.apply({ state: "working", hook: "PreToolUse", tool: "Edit", target: "a.ts" }, 1);
  room.apply({ state: "working", hook: "PostToolUse", tool: "Edit", target: "a.ts" }, 2);
  return room;
}
function test(room: Room, failed: boolean, at: number): void {
  room.apply({ state: "working", hook: "PreToolUse", tool: "Bash", target: "npm test" }, at);
  room.apply({ state: failed ? "error" : "working", hook: failed ? "PostToolUseFailure" : "PostToolUse", tool: "Bash", target: "npm test" }, at + 1);
}
function stop(room: Room, hook = "Stop") {
  return room.apply({ state: hook === "StopFailure" ? "error" : "success", hook, text: "Done" }, 100)!.talk.at(-1)!.report!;
}

describe("truthful turn results", () => {
  it("uses a scroll when edits are followed by failed tests", () => {
    const room = editingRoom();
    test(room, true, 10);
    expect(stop(room)).toMatchObject({ kind: "scroll", files: ["a.ts"], tests: { passed: 0, failed: 1, last: "failed" } });
  });
  it("lets the last passing run restore victory while retaining past failure counts", () => {
    const room = editingRoom();
    test(room, true, 10); test(room, false, 20);
    expect(stop(room)).toMatchObject({ kind: "chest", tests: { passed: 1, failed: 1, last: "passed" }, failures: 1 });
  });
  it("uses a scroll for edits without tests, and a fall overrides passing tests", () => {
    const untested = stop(editingRoom());
    expect(untested).toMatchObject({ kind: "scroll", files: ["a.ts"], tests: { passed: 0, failed: 0 } });
    for (const tested of [false, true]) {
      const room = editingRoom();
      if (tested) test(room, false, 10);
      expect(stop(room, "StopFailure")).toMatchObject({ kind: "scroll", stopFailure: true });
    }
  });
  it("does not replace the last test result with unfinished, interrupted, ordinary or helper tools", () => {
    const room = editingRoom(); test(room, true, 10);
    room.apply({ state: "working", hook: "PostToolUse", tool: "Read" }, 20);
    room.apply({ state: "working", hook: "PreToolUse", tool: "Bash", target: "npm test" }, 21);
    room.apply({ state: "idle", hook: "PostToolUseFailure", tool: "Bash", target: "npm test" }, 22);
    room.apply({ state: "working", hook: "PostToolUse", tool: "Bash", target: "npm test", subagent: { id: "h" } }, 23);
    expect(stop(room).tests).toEqual({ passed: 0, failed: 1, last: "failed" });
  });
  it("uses event-time order for late test completions and corrects an existing card", () => {
    const room = editingRoom(); test(room, true, 10);
    const report = stop(room);
    room.apply({ state: "working", hook: "PostToolUse", tool: "Bash", target: "npm test" }, 5);
    expect(report.tests.last).toBe("failed");
    room.apply({ state: "working", hook: "PostToolUse", tool: "Bash", target: "npm test" }, 20);
    expect(report.tests).toEqual({ passed: 2, failed: 1, last: "passed" });
    expect(report.kind).toBe("chest");
  });
  it("preserves the last result when older marks fold into totals", () => {
    const turns = emptyTurns();
    recordTurn(turns, { state: "thinking", hook: "UserPromptSubmit" }, 0);
    recordTurn(turns, { state: "error", hook: "PostToolUseFailure", tool: "Bash", target: "npm test" }, 1);
    for (let at = 2; at <= TURN_MARK_LIMIT + 10; at++) recordTurn(turns, { state: "working", hook: "PostToolUse", tool: "Read" }, at);
    recordTurn(turns, { state: "success", hook: "Stop" }, 1000);
    expect(turns.updates.get(1000)).toMatchObject({ kind: "scroll", tests: { last: "failed" } });
  });
});
