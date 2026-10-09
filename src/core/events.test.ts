import { describe, expect, it } from "vitest";
import { parseAgentEvent, type AgentState } from "./events";

const states: AgentState[] = ["idle", "thinking", "working", "waiting_input", "success", "error"];

describe("parseAgentEvent", () => {
  it.each(states)("accepts state %s", (state) => {
    expect(parseAgentEvent({ state })).toEqual({ ok: true, event: { state } });
  });

  it("preserves valid optional fields and ignores unrelated data", () => {
    expect(parseAgentEvent({ state: "working", detail: "Compiling", ts: 123, extra: true })).toEqual({
      ok: true, event: { state: "working", detail: "Compiling", ts: 123 },
    });
    expect(parseAgentEvent({ state: "idle", detail: "", ts: 0 })).toEqual({
      ok: true, event: { state: "idle", detail: "", ts: 0 },
    });
  });

  it("accepts omitted or undefined optional fields", () => {
    expect(parseAgentEvent({ state: "idle", detail: undefined, ts: undefined })).toEqual({
      ok: true, event: { state: "idle" },
    });
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
