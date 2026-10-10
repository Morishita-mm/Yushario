import { describe, expect, it } from "vitest";
import { waitingAfterEvent } from "./session-actions";

describe("session readiness", () => {

  it("recognizes waiting and busy boundaries including compact", () => {
    for (const hook of ["SessionStart", "Stop", "StopFailure", "PostCompact"]) {
      expect(waitingAfterEvent({ state: "idle", hook })).toBe(true);
    }
    for (const hook of ["UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure", "PreCompact"]) {
      expect(waitingAfterEvent({ state: "working", hook })).toBe(false);
    }
  });

  it("ignores interrupted-turn tool hooks until the next prompt", () => {
    expect(waitingAfterEvent({ state: "idle", hook: "PostToolUseFailure" }, true)).toBeUndefined();
    expect(waitingAfterEvent({ state: "working", hook: "PostToolUse" }, true)).toBeUndefined();
    expect(waitingAfterEvent({ state: "thinking", hook: "UserPromptSubmit" }, true)).toBe(false);
    expect(waitingAfterEvent({ state: "success", hook: "Stop" }, true)).toBe(true);
  });

  it("ignores unrelated hooks and subagents, even those finishing after Stop", () => {
    for (const hook of [undefined, "Notification", "SubagentStop", "SessionEnd", "TaskCompleted"]) {
      expect(waitingAfterEvent({ state: "working", hook })).toBeUndefined();
    }
    expect(waitingAfterEvent({ state: "success", hook: "Stop", subagent: { id: "helper" } })).toBeUndefined();
  });
});
