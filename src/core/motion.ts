import type { Candidate, Expression, Posture } from "./decider";

// Signed parameters use [-1, 1]; eyeOpen and mouthSmile use [0, 1].
export interface MotionParams {
  headX: number;
  headY: number;
  bodyX: number;
  eyeOpen: number;
  mouthSmile: number;
  brow: number;
}

const EXPRESSIONS: Record<Expression, Pick<MotionParams, "eyeOpen" | "mouthSmile" | "brow">> = {
  neutral: { eyeOpen: 0.9, mouthSmile: 0.15, brow: 0 },
  focused: { eyeOpen: 0.7, mouthSmile: 0.05, brow: -0.35 },
  happy: { eyeOpen: 0.8, mouthSmile: 0.9, brow: 0.3 },
  troubled: { eyeOpen: 0.65, mouthSmile: 0, brow: -0.7 },
  surprised: { eyeOpen: 1, mouthSmile: 0.1, brow: 0.8 },
};

const POSTURES: Record<Posture, Pick<MotionParams, "headX" | "headY" | "bodyX">> = {
  upright: { headX: 0, headY: 0, bodyX: 0 },
  lean_forward: { headX: 0, headY: -0.25, bodyX: 0.35 },
  tilt: { headX: 0.3, headY: 0.1, bodyX: 0.1 },
  slump: { headX: -0.1, headY: -0.45, bodyX: -0.3 },
};

const KEYS: readonly (keyof MotionParams)[] = [
  "headX", "headY", "bodyX", "eyeOpen", "mouthSmile", "brow",
];
const SPRING_FREQUENCY = 8;
const BLINK_DURATION_MS = 180;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class MotionGenerator {
  private target: MotionParams = { ...POSTURES.upright, ...EXPRESSIONS.neutral };
  private current: MotionParams = { ...this.target };
  private velocity: MotionParams = { headX: 0, headY: 0, bodyX: 0, eyeOpen: 0, mouthSmile: 0, brow: 0 };
  private timeMs = 0;
  private blinkStartMs = -Infinity;
  private nextBlinkMs: number;
  private readonly swayPhaseX: number;
  private readonly swayPhaseY: number;

  // rng supplies values in [0, 1); no global randomness or platform APIs are used.
  constructor(private readonly rng: () => number) {
    this.swayPhaseX = rng() * Math.PI * 2;
    this.swayPhaseY = rng() * Math.PI * 2;
    this.nextBlinkMs = this.blinkInterval();
  }

  setTarget(candidate: Candidate): void {
    this.target = { ...POSTURES[candidate.posture], ...EXPRESSIONS[candidate.expression] };
  }

  update(dtMs: number): MotionParams {
    if (!Number.isFinite(dtMs) || dtMs < 0) throw new RangeError("dtMs must be finite and non-negative");
    const dt = dtMs / 1000;
    this.timeMs += dtMs;
    const decay = Math.exp(-SPRING_FREQUENCY * dt);

    // Exact critically damped spring solution: stable even for a long frame.
    for (const key of KEYS) {
      const displacement = this.current[key] - this.target[key];
      const coefficient = this.velocity[key] + SPRING_FREQUENCY * displacement;
      this.current[key] = this.target[key] + (displacement + coefficient * dt) * decay;
      this.velocity[key] = (this.velocity[key] - SPRING_FREQUENCY * coefficient * dt) * decay;
    }

    if (this.timeMs >= this.nextBlinkMs) {
      this.blinkStartMs = this.nextBlinkMs;
      this.nextBlinkMs = Math.max(this.timeMs, this.blinkStartMs + BLINK_DURATION_MS) + this.blinkInterval();
    }
    const blinkAge = this.timeMs - this.blinkStartMs;
    const blink = blinkAge < BLINK_DURATION_MS
      ? Math.sin(Math.PI * blinkAge / BLINK_DURATION_MS) ** 2
      : 0;
    const time = this.timeMs / 1000;
    // Random-phase low-frequency waves add bounded sway, separate from the spring.
    const swayX = 0.012 * Math.sin(time * 0.7 + this.swayPhaseX)
      + 0.006 * Math.sin(time * 0.31 + this.swayPhaseY);
    const swayY = 0.012 * Math.sin(time * 0.53 + this.swayPhaseY);
    const breath = Math.sin(time * Math.PI / 2);

    return {
      headX: clamp(this.current.headX + swayX, -1, 1),
      headY: clamp(this.current.headY + swayY + breath * 0.006, -1, 1),
      bodyX: clamp(this.current.bodyX + breath * 0.02, -1, 1),
      eyeOpen: clamp(this.current.eyeOpen * (1 - blink), 0, 1),
      mouthSmile: clamp(this.current.mouthSmile, 0, 1),
      brow: clamp(this.current.brow, -1, 1),
    };
  }

  private blinkInterval(): number {
    return 2500 + this.rng() * 3000;
  }
}
