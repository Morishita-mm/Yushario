import { describe, expect, it } from "vitest";
import { attachReports, emptyTurns, recordTurn, TURN_FILE_LIMIT, TURN_MARK_LIMIT, type TalkEntry } from "./turns";

describe("bounded turn aggregation", () => {
  it("keeps exact totals and a bounded recent window for a long textless round", () => {
    const turns = emptyTurns();
    recordTurn(turns, { state: "thinking", hook: "UserPromptSubmit", context: 0.2 }, 0);
    recordTurn(turns, { state: "waiting_input", hook: "PermissionRequest" }, 1);
    for (let at = 2; at < 40_002; at++) {
      recordTurn(turns, { state: "working", hook: at % 2 ? "PostToolUse" : "PreToolUse", tool: "Bash", target: "npm test" }, at);
    }
    expect(turns.marks).toHaveLength(TURN_MARK_LIMIT);
    expect(turns.prefix.active?.report.tools).toBeGreaterThan(0);
    recordTurn(turns, { state: "success", hook: "Stop", context: 0.6 }, 40_002);
    const talk: TalkEntry[] = [{ at: 40_002, from: "hero", text: "done" }];
    attachReports(talk, turns);
    expect(talk[0].report).toMatchObject({ tools: 20_000, tests: { passed: 20_000, failed: 0 },
      waitedMs: 1, startedAt: 0, endedAt: 40_002, mp: { start: 0.8, end: 0.4 } });
    expect(turns.current.active).toBeUndefined();
  });

  it("does not count a test whose command shape hides its result", () => {
    const turns = emptyTurns();
    recordTurn(turns, { state: "thinking", hook: "UserPromptSubmit" }, 0);
    recordTurn(turns, { state: "working", hook: "PostToolUse", tool: "Bash", target: "npm test || true" }, 1);
    recordTurn(turns, { state: "error", hook: "PostToolUseFailure", tool: "Bash", target: "true; npm test" }, 2);
    recordTurn(turns, { state: "working", hook: "PostToolUse", tool: "Bash", target: "npm test" }, 3);
    recordTurn(turns, { state: "success", hook: "Stop" }, 4);
    const talk: TalkEntry[] = [{ at: 4, from: "hero", text: "done" }];
    attachReports(talk, turns);
    expect(talk[0].report?.tests).toEqual({ passed: 1, failed: 0, last: "passed" });
  });

  it("also bounds input that has no prompt, no text and no completed turns", () => {
    const turns = emptyTurns();
    for (let at = 0; at < 10_000; at++) recordTurn(turns, { state: "working", tool: "Read", hook: "PreToolUse" }, at);
    expect(turns.marks).toHaveLength(TURN_MARK_LIMIT);
    expect(turns.current.active).toBeUndefined();
    expect(turns.prefix.active).toBeUndefined();
  });

  it("caps distinct file metadata, not tool or failure counters", () => {
    const turns = emptyTurns();
    recordTurn(turns, { state: "thinking", hook: "UserPromptSubmit" }, 0);
    for (let at = 1; at <= 1000; at++) recordTurn(turns,
      { state: "working", hook: "PostToolUse", tool: "Write", target: `${at}.ts` }, at);
    expect(turns.current.active?.report.files).toHaveLength(TURN_FILE_LIMIT);
    expect(turns.current.active?.report.files[0]).toBe("1.ts");
  });

  it("never revisits old completed cards for ordinary new-round hooks", () => {
    const turns = emptyTurns();
    recordTurn(turns, { state: "thinking", hook: "UserPromptSubmit" }, 0);
    recordTurn(turns, { state: "success", hook: "Stop" }, 10);
    const talk: TalkEntry[] = [{ at: 10, from: "hero", text: "done" }];
    attachReports(talk, turns);
    const original = talk[0].report;
    recordTurn(turns, { state: "thinking", hook: "UserPromptSubmit" }, 20);
    recordTurn(turns, { state: "working", hook: "PreToolUse", tool: "Read" }, 30);
    expect(turns.updates.size).toBe(0);
    attachReports(talk, turns);
    expect(talk[0].report).toBe(original);
  });

  it("corrects a folded current round for late hooks still inside the retained window", () => {
    const turns = emptyTurns();
    recordTurn(turns, { state: "thinking", hook: "UserPromptSubmit" }, 0);
    for (let at = 1; at <= 1000; at++) recordTurn(turns, { state: "working", hook: "PreToolUse", tool: "Read" }, at);
    recordTurn(turns, { state: "success", hook: "Stop" }, 1001);
    const talk: TalkEntry[] = [{ at: 1001, from: "hero", text: "done" }];
    attachReports(talk, turns);
    recordTurn(turns, { state: "working", hook: "PostToolUse", tool: "Edit", target: "late.ts" }, 999);
    attachReports(talk, turns);
    expect(talk[0].report).toMatchObject({ tools: 1000, files: ["late.ts"], kind: "scroll" });
    recordTurn(turns, { state: "working", hook: "PostToolUse", tool: "Edit", target: "too-old.ts" }, 1);
    expect(turns.updates.size).toBe(0);
    expect(turns.marks).toHaveLength(TURN_MARK_LIMIT);
  });
});
