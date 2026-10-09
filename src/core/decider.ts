import type { AgentEvent } from "./events";

export type Expression = "neutral" | "focused" | "happy" | "troubled" | "surprised";
export type Posture = "upright" | "lean_forward" | "tilt" | "slump";

export type Gesture = "nod" | "shake" | "wave" | "think" | "cheer" | "tremble";

export interface Candidate {
  expression: Expression;
  posture: Posture;
  gesture?: Gesture;
  score: number;
}

export interface DecisionContext {
  event: AgentEvent;
  recent: AgentEvent[]; // Oldest first, includes event, at most ten entries.
  previous?: Candidate;
  elapsedMs: number;
}

export interface Decider {
  decide(ctx: DecisionContext): Promise<Candidate[]>;
}

const EXPRESSIONS: readonly Expression[] = ["neutral", "focused", "happy", "troubled", "surprised"];
const POSTURES: readonly Posture[] = ["upright", "lean_forward", "tilt", "slump"];
const GESTURES: readonly Gesture[] = ["nod", "shake", "wave", "think", "cheer", "tremble"];

// Runtime check for candidates received over the WebSocket.
export function isCandidate(value: unknown): value is Candidate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Candidate;
  return EXPRESSIONS.includes(candidate.expression) && POSTURES.includes(candidate.posture)
    && (candidate.gesture === undefined || GESTURES.includes(candidate.gesture))
    && typeof candidate.score === "number" && Number.isFinite(candidate.score);
}
