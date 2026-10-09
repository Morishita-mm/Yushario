import type { Expression } from "../../core/decider";
import type { MotionParams } from "../../core/motion";

export interface Renderer {
  apply(params: MotionParams): void;
  setExpression?(expression: Expression): void;
}
