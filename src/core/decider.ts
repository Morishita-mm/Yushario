import type { AgentEvent } from "./events";

export type Expression = "neutral" | "focused" | "happy" | "troubled" | "surprised";
export type Posture = "upright" | "lean_forward" | "tilt" | "slump";

export interface Candidate {
  expression: Expression;
  posture: Posture;
  score: number;
}

export interface DecisionContext {
  event: AgentEvent;
  previous?: Candidate;
  elapsedMs: number;
}

export interface Decider {
  decide(ctx: DecisionContext): Promise<Candidate[]>;
}
