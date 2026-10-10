import { describe, expect, it } from "vitest";
import { MAX_EVENT_METADATA_LENGTH, MAX_EVENT_TEXT_LENGTH, parseAgentEvent, type AgentState } from "./events";

const states: AgentState[] = ["idle", "thinking", "working", "waiting_input", "success", "error"];

describe("parseAgentEvent", () => {
  it.each(states)("accepts state %s", (state) => {
    expect(parseAgentEvent({ state })).toEqual({ ok: true, event: { state } });
  });

  it("preserves valid optional fields and ignores unrelated data", () => {
    expect(parseAgentEvent({ state: "working", detail: "Compiling", ts: 123, source: "pi", tool: "bash", extra: true })).toEqual({
      ok: true, event: { state: "working", detail: "Compiling", ts: 123, source: "pi", tool: "bash" },
    });
    expect(parseAgentEvent({ state: "idle", detail: "", ts: 0 })).toEqual({
      ok: true, event: { state: "idle", detail: "", ts: 0 },
    });
  });

  it("accepts omitted or undefined optional fields", () => {
    expect(parseAgentEvent({ state: "idle", detail: undefined, ts: undefined, source: undefined, tool: undefined })).toEqual({
      ok: true, event: { state: "idle" },
    });
  });

  it.each(["source", "tool", "terminal", "project"] as const)("validates optional %s metadata", (field) => {
    for (const text of ["", "x".repeat(MAX_EVENT_METADATA_LENGTH)]) {
      expect(parseAgentEvent({ state: "working", [field]: text })).toEqual({
        ok: true, event: { state: "working", [field]: text },
      });
    }
    for (const invalid of [null, 42, false, {}, [], "x".repeat(MAX_EVENT_METADATA_LENGTH + 1)]) {
      const result = parseAgentEvent({ state: "working", [field]: invalid });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain(field);
    }
  });

  it("accepts local conversation text up to 8000 characters", () => {
    for (const text of ["", "こんにちは\n```ts\nconst n = 1;\n```", "x".repeat(MAX_EVENT_TEXT_LENGTH)]) {
      expect(parseAgentEvent({ state: "success", hook: "Stop", text })).toEqual({
        ok: true, event: { state: "success", hook: "Stop", text },
      });
    }
    expect(parseAgentEvent({ state: "idle", text: undefined })).toEqual({ ok: true, event: { state: "idle" } });
  });

  it.each([null, 1, false, {}, [], "x".repeat(MAX_EVENT_TEXT_LENGTH + 1)])("rejects invalid text", (text) => {
    const result = parseAgentEvent({ state: "success", text });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("text");
  });

  it.each([0, 0.2, 0.7, 0.95, 1])("preserves context usage %s", (context) => {
    expect(parseAgentEvent({ state: "working", context })).toEqual({
      ok: true, event: { state: "working", context },
    });
  });

  it("omits unknown context usage", () => {
    expect(parseAgentEvent({ state: "idle", context: undefined })).toEqual({
      ok: true, event: { state: "idle" },
    });
  });

  it.each([null, "0.7", false, {}, [], NaN, Infinity, -Infinity, -0.01, 1.01])(
    "rejects invalid context %j", (context) => {
      const result = parseAgentEvent({ state: "working", context });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("context");
    },
  );

  it.each([
    null, undefined, false, 42, "idle", [], {}, { state: "unknown" }, { state: 1 },
    { state: "idle", detail: 1 }, { state: "idle", detail: null },
    { state: "idle", ts: "123" }, { state: "idle", ts: null },
    { state: "idle", ts: NaN }, { state: "idle", ts: Infinity }, { state: "idle", ts: -Infinity },
  ])("rejects malformed input %j with an error", (input) => {
    const result = parseAgentEvent(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });

  it("accepts room fields: agent, name, hook, target, subagent and task", () => {
    const event = {
      state: "working", agent: "s1", name: "t12-vitals", hook: "PreToolUse", target: "room.ts", terminal: "pty1", project: "repo",
      subagent: { id: "h1", type: "Explore" }, task: { id: "1", subject: "Write tests", status: "in_progress" },
    };
    expect(parseAgentEvent(event)).toEqual({ ok: true, event });
    expect(parseAgentEvent({ state: "working", subagent: { id: "h1" }, task: { id: "2", status: "deleted" } }))
      .toEqual({ ok: true, event: { state: "working", subagent: { id: "h1" }, task: { id: "2", status: "deleted" } } });
  });

  it.each([
    { subagent: "h1" }, { subagent: { id: "" } }, { subagent: { id: "h1", type: 3 } },
    { task: { id: "1", status: "done" } }, { task: { status: "pending" } },
    { task: { id: "1", subject: "x".repeat(MAX_EVENT_METADATA_LENGTH + 1), status: "pending" } },
    { target: "x".repeat(MAX_EVENT_METADATA_LENGTH + 1) }, { agent: 1 },
  ])("rejects malformed room field %j", (fields) => {
    expect(parseAgentEvent({ state: "working", ...fields }).ok).toBe(false);
  });

});
