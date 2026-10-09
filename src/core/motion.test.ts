import { describe, expect, it } from "vitest";
import type { Candidate, Expression, Posture } from "./decider";
import { MotionGenerator, type MotionParams } from "./motion";

const happyTilt: Candidate = { expression: "happy", posture: "tilt", score: 1 };

function expectWithinRange(params: MotionParams): void {
  for (const [key, value] of Object.entries(params)) {
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(key === "eyeOpen" ? 0 : -1);
    expect(value).toBeLessThanOrEqual(1);
  }
}

describe("MotionGenerator", () => {
  it("transitions smoothly and converges to the target plus bounded idle motion", () => {
    const motion = new MotionGenerator(() => 0.5);
    const before = motion.update(0);
    motion.setTarget(happyTilt);
    const firstFrame = motion.update(16);
    expect(firstFrame.mouthSmile).toBeGreaterThan(before.mouthSmile);
    expect(firstFrame.mouthSmile).toBeLessThan(0.2);
    let params = firstFrame;
    for (let i = 0; i < 124; i++) params = motion.update(16);
    expect(params.mouthSmile).toBeCloseTo(0.9, 4);
    expect(params.eyeOpen).toBeCloseTo(0.8, 4);
    expect(params.brow).toBeCloseTo(0.3, 4);
    expect(Math.abs(params.headX - 0.45)).toBeLessThanOrEqual(0.019);
    expect(Math.abs(params.headY - 0.1)).toBeLessThanOrEqual(0.019);
    expect(Math.abs(params.bodyX - 0.15)).toBeLessThanOrEqual(0.021);
    expectWithinRange(params);
  });

  it("transitions from a smile to a negative troubled mouth and back", () => {
    const motion = new MotionGenerator(() => 0.5);
    expect(motion.update(0).mouthSmile).toBeGreaterThan(0);
    motion.setTarget({ expression: "troubled", posture: "slump", score: 1 });
    const troubled = motion.update(2000);
    expect(troubled.mouthSmile).toBeCloseTo(-0.8, 4);
    expectWithinRange(troubled);
    motion.setTarget(happyTilt);
    expect(motion.update(2000).mouthSmile).toBeCloseTo(0.9, 4);
  });

  it("keeps every expression/posture combination bounded during repeated transitions", () => {
    const expressions: Expression[] = ["neutral", "focused", "happy", "troubled", "surprised"];
    const postures: Posture[] = ["upright", "lean_forward", "tilt", "slump"];
    const motion = new MotionGenerator(() => 0.5);
    for (const expression of expressions) {
      for (const posture of postures) {
        motion.setTarget({ expression, posture, score: 1 });
        for (let i = 0; i < 180; i++) expectWithinRange(motion.update(i % 3 === 0 ? 33 : 16));
      }
    }
  });

  it("produces reproducible motion with fixed rng and timestep", () => {
    const first = new MotionGenerator(() => 0.25);
    const second = new MotionGenerator(() => 0.25);
    first.setTarget(happyTilt);
    second.setTarget(happyTilt);
    for (let i = 0; i < 600; i++) expect(first.update(16)).toEqual(second.update(16));
  });

  it("uses a frame-rate independent spring, including a long frame", () => {
    const large = new MotionGenerator(() => 0.5);
    const small = new MotionGenerator(() => 0.5);
    large.setTarget(happyTilt);
    small.setTarget(happyTilt);
    const largeParams = large.update(2000);
    let smallParams = small.update(20);
    for (let i = 0; i < 99; i++) smallParams = small.update(20);
    for (const key of Object.keys(largeParams) as (keyof MotionParams)[]) {
      expect(largeParams[key]).toBeCloseTo(smallParams[key], 10);
    }
    expectWithinRange(large.update(60_000));
  });

  it("adds breathing, sway, and rng-timed blink closure and reopening", () => {
    const motion = new MotionGenerator(() => 0);
    const initial = motion.update(0);
    const idle = motion.update(1000);
    expect(idle.bodyX).not.toBe(initial.bodyX);
    expect(idle.headX).not.toBe(initial.headX);
    expect(motion.update(1500).eyeOpen).toBeCloseTo(0.9);
    expect(motion.update(90).eyeOpen).toBeCloseTo(0);
    expect(motion.update(90).eyeOpen).toBeCloseTo(0.9);
    const laterBlink = new MotionGenerator(() => 0.99);
    expect(laterBlink.update(2590).eyeOpen).toBeCloseTo(0.9);
  });

  it.each([-1, NaN, Infinity])("rejects invalid dtMs %s", (dtMs) => {
    expect(() => new MotionGenerator(() => 0).update(dtMs)).toThrow(RangeError);
  });
});
