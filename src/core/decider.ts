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
