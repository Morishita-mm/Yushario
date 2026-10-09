import { describe, expect, it, vi } from "vitest";
import type { Candidate } from "./decider";
import { selectCandidate } from "./selector";

const best: Candidate = { expression: "happy", posture: "upright", score: 1 };
const near: Candidate = { expression: "neutral", posture: "tilt", score: 0.97 };
const distant: Candidate = { expression: "troubled", posture: "slump", score: 0.5 };

describe("selectCandidate", () => {
  it("selects the highest score without randomness when clearly ahead", () => {
    const rng = vi.fn(() => 0.9);
    expect(selectCandidate([distant, best], rng)).toBe(best);
    expect(rng).not.toHaveBeenCalled();
  });

  it("deterministically chooses among only near-top candidates", () => {
    const candidates = [best, distant, near];
    for (let i = 0; i < 10; i++) {
      expect(selectCandidate(candidates, () => 0)).toBe(best);
      expect(selectCandidate(candidates, () => 0.99)).toBe(near);
    }
    expect(candidates).toEqual([best, distant, near]);
  });

  it("uses the injected rng to break equal scores", () => {
    const tied = { ...near, score: 1 };
    expect(selectCandidate([best, tied], () => 0)).toBe(best);
    expect(selectCandidate([best, tied], () => 0.75)).toBe(tied);
  });

  it("handles single candidates and negative scores", () => {
    expect(selectCandidate([near], () => 0.5)).toBe(near);
    const negative = { ...best, score: -1 };
    expect(selectCandidate([{ ...distant, score: -3 }, negative], () => 0)).toBe(negative);
  });

  it("rejects an empty list", () => {
    expect(() => selectCandidate([], () => 0)).toThrow("empty");
  });
});
