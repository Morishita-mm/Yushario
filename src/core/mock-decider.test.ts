import { describe, expect, it } from "vitest";
import type { AgentState } from "./events";
import { MockDecider } from "./mock-decider";

const states: AgentState[] = ["idle", "thinking", "working", "waiting_input", "success", "error"];

describe("MockDecider", () => {
  it.each(states)("returns two or three scored candidates for %s", async (state) => {
    const candidates = await new MockDecider().decide({ event: { state }, elapsedMs: 0 });
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates.length).toBeLessThanOrEqual(3);
    for (const candidate of candidates) {
      expect(["neutral", "focused", "happy", "troubled", "surprised"]).toContain(candidate.expression);
      expect(["upright", "lean_forward", "tilt", "slump"]).toContain(candidate.posture);
      expect(Number.isFinite(candidate.score)).toBe(true);
    }
  });

  it("uses fixed rules and gives callers independent candidates", async () => {
    const decider = new MockDecider();
    const context = { event: { state: "success" as const }, elapsedMs: 100 };
    const original = await decider.decide(context);
    expect(await decider.decide({ ...context, elapsedMs: 1000, previous: original[0] })).toEqual(original);
    original[0].score = -99;
    expect((await decider.decide(context))[0].score).toBe(1);
  });
});
