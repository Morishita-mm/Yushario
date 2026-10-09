import { describe, expect, it } from "vitest";
import { MAX_EVENT_METADATA_LENGTH, parseAgentEvent, type AgentState } from "./events";

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

  it.each(["source", "tool"] as const)("validates optional %s metadata", (field) => {
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
});
