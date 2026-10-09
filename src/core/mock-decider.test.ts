import { describe, expect, it } from "vitest";
import type { AgentState } from "./events";
import type { Candidate, DecisionContext } from "./decider";
import { MockDecider } from "./mock-decider";
import { selectCandidate } from "./selector";

const states: AgentState[] = ["idle", "thinking", "working", "waiting_input", "success", "error"];
const decider = new MockDecider();

function context(history: AgentState[], previous?: Candidate): DecisionContext {
  const recent = history.map((state) => ({ state }));
  return { event: recent.at(-1)!, recent, previous, elapsedMs: 0 };
}

describe("MockDecider", () => {
  it.each(states)("returns two or three scored candidates for %s", async (state) => {
    const candidates = await decider.decide(context([state]));
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates.length).toBeLessThanOrEqual(3);
    for (const candidate of candidates) {
      expect(["neutral", "focused", "happy", "troubled", "surprised"]).toContain(candidate.expression);
      expect(["upright", "lean_forward", "tilt", "slump"]).toContain(candidate.posture);
      expect(Number.isFinite(candidate.score)).toBe(true);
    }
  });

  it("uses fixed rules and gives callers independent candidates", async () => {
    const ctx = context(["success"]);
    const original = await decider.decide(ctx);
    expect(await decider.decide({ ...ctx, elapsedMs: 1000, previous: original[0] })).toEqual(original);
    original[0].score = -99;
    expect((await decider.decide(ctx))[0].score).toBe(1);
  });

  it.each(states)("preserves the previous choice without replaying gestures on repeated %s", async (state) => {
    const previous = (await decider.decide(context([state])))[1];
    const candidates = await decider.decide(context([state, state], previous));
    expect(candidates).toEqual([{ expression: previous.expression, posture: previous.posture, score: 2 }]);
    expect(selectCandidate(candidates, () => 0.99)).toEqual(candidates[0]);
    expect(previous.score).not.toBe(2);
  });

  it("does not invent gestures on a repeated state without a previous choice", async () => {
    expect((await decider.decide(context(["thinking", "thinking"]))).every((c) => !c.gesture)).toBe(true);
  });

  it.each([
    ["thinking", "think"], ["working", "nod"], ["waiting_input", "wave"], ["success", "cheer"], ["error", "shake"],
  ] as const)("offers %s transition gesture %s", async (state, gesture) => {
    const candidates = await decider.decide(context(["idle", state]));
    expect(candidates.every((candidate) => candidate.gesture === gesture)).toBe(true);
  });

  it("trembles when reentering error with multiple errors in recent history", async () => {
    const candidates = await decider.decide(context(["error", "working", "error"]));
    expect(selectCandidate(candidates, () => 0).expression).toBe("troubled");
    expect(candidates.every((candidate) => candidate.gesture === "tremble")).toBe(true);
    const previous = selectCandidate(candidates, () => 0);
    expect((await decider.decide(context(["error", "working", "error", "error"], previous)))[0].gesture).toBeUndefined();
  });

  it("unambiguously cheers with a happy face after recent errors, even with working between", async () => {
    const candidates = await decider.decide(context(["error", "working", "success"]));
    for (const rng of [() => 0, () => 0.99]) {
      expect(selectCandidate(candidates, rng)).toMatchObject({ expression: "happy", gesture: "cheer", score: 2 });
    }
  });

  it("forgets errors outside the supplied recent window", async () => {
    const candidates = await decider.decide(context(["working", "error"]));
    expect(candidates[0].gesture).toBe("shake");
    expect((await decider.decide(context(["working", "success"])))[0].score).toBe(1);
  });

  it("has no idle transition gesture", async () => {
    expect((await decider.decide(context(["success", "idle"]))).every((c) => !c.gesture)).toBe(true);
  });
});
