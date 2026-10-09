// Jev's stand-in: fixed state rules supply candidates without remote inference.
import type { Candidate, Decider, DecisionContext } from "./decider";

const RULES = {
  idle: [
    { expression: "neutral", posture: "upright", score: 0.9 },
    { expression: "neutral", posture: "tilt", score: 0.87 },
  ],
  thinking: [
    { expression: "focused", posture: "tilt", score: 0.95 },
    { expression: "focused", posture: "lean_forward", score: 0.92 },
    { expression: "neutral", posture: "upright", score: 0.7 },
  ],
  working: [
    { expression: "focused", posture: "lean_forward", score: 0.95 },
    { expression: "focused", posture: "upright", score: 0.91 },
  ],
  waiting_input: [
    { expression: "neutral", posture: "tilt", score: 0.9 },
    { expression: "surprised", posture: "upright", score: 0.86 },
  ],
  success: [
    { expression: "happy", posture: "upright", score: 1 },
    { expression: "happy", posture: "tilt", score: 0.97 },
    { expression: "surprised", posture: "upright", score: 0.75 },
  ],
  error: [
    { expression: "troubled", posture: "slump", score: 0.95 },
    { expression: "troubled", posture: "tilt", score: 0.92 },
    { expression: "surprised", posture: "upright", score: 0.7 },
  ],
} satisfies Record<DecisionContext["event"]["state"], Candidate[]>;

export class MockDecider implements Decider {
  async decide(ctx: DecisionContext): Promise<Candidate[]> {
    return RULES[ctx.event.state].map((candidate) => ({ ...candidate }));
  }
}
