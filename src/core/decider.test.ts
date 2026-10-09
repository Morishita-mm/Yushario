import { describe, expect, it } from "vitest";
import { isCandidate } from "./decider";

describe("isCandidate", () => {
  it("accepts a complete candidate with or without a gesture", () => {
    expect(isCandidate({ expression: "happy", posture: "tilt", score: 1 })).toBe(true);
    expect(isCandidate({ expression: "troubled", posture: "slump", gesture: "tremble", score: 0.2 })).toBe(true);
  });

  it.each([
    null, "happy", { expression: "angry", posture: "tilt", score: 1 },
    { expression: "happy", posture: "dance", score: 1 }, { expression: "happy", posture: "tilt", gesture: "jump", score: 1 },
    { expression: "happy", posture: "tilt", score: Infinity }, { expression: "happy", posture: "tilt" },
  ])("rejects %j", (value) => {
    expect(isCandidate(value)).toBe(false);
  });
});
