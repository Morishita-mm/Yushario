// Jev's stand-in: fixed state rules supply candidates without remote inference.
import type { Candidate, Decider, DecisionContext, Gesture } from "./decider";

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

const TRANSITION_GESTURES: Partial<Record<DecisionContext["event"]["state"], Gesture>> = {
  thinking: "think",
  working: "nod",
  waiting_input: "wave",
  success: "cheer",
  error: "shake",
};

function transitionGesture(ctx: DecisionContext): Gesture | undefined {
  const errors = ctx.recent.filter((event) => event.state === "error").length;
  if (ctx.event.state === "error" && errors >= 2) return "tremble";
  return TRANSITION_GESTURES[ctx.event.state];
}

export class MockDecider implements Decider {
  async decide(ctx: DecisionContext): Promise<Candidate[]> {
    const repeated = ctx.recent.at(-2)?.state === ctx.event.state;
    if (repeated && ctx.previous) {
      // Keep the chosen face/posture, but never repeat a one-shot gesture.
      const { gesture: _, ...previous } = ctx.previous;
      return [{ ...previous, score: 2 }];
    }
    const candidates: Candidate[] = RULES[ctx.event.state].map((candidate) => ({ ...candidate }));
    const recovering = ctx.event.state === "success" && ctx.recent.some((event) => event.state === "error");
    if (recovering) {
      // Recovery is intentionally unambiguous, unlike the usual near-tied happy alternatives.
      candidates[0].score = 2;
    }
    if (!repeated) {
      const gesture = transitionGesture(ctx);
      for (const candidate of candidates) {
        if (gesture) candidate.gesture = gesture;
      }
    }
    return candidates;
  }
}
