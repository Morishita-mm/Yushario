import type { MotionParams } from "../../core/motion";

export interface Renderer {
  apply(params: MotionParams): void;
}
