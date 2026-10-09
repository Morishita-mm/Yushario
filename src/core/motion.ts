import type { Candidate, Expression, Posture } from "./decider";

// Signed parameters (including mouthSmile: negative = frown) use [-1, 1]; eyeOpen uses [0, 1].
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
  focused: { eyeOpen: 0.7, mouthSmile: -0.15, brow: -0.35 },
  happy: { eyeOpen: 0.8, mouthSmile: 0.9, brow: 0.3 },
  troubled: { eyeOpen: 0.65, mouthSmile: -0.8, brow: -0.7 },
  surprised: { eyeOpen: 1, mouthSmile: 0.1, brow: 0.8 },
};

const POSTURES: Record<Posture, Pick<MotionParams, "headX" | "headY" | "bodyX">> = {
  upright: { headX: 0, headY: 0, bodyX: 0 },
  lean_forward: { headX: 0, headY: -0.4, bodyX: 0.5 },
  tilt: { headX: 0.45, headY: 0.1, bodyX: 0.15 },
  slump: { headX: -0.2, headY: -0.6, bodyX: -0.45 },
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
  private fatigue = 0;
  private currentFatigue = 0;
  private breathDelay = 0;
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

  setFatigue(f: number): void {
    this.fatigue = Number.isNaN(f) ? 0 : clamp(f, 0, 1);
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
    // Random-phase low-frequency waves add a visible, bounded idle sway (|x| <= 0.2, |y| <= 0.09),
    // separate from the spring. Incommensurate periods (~5-17 s) keep it from looking looped.
    const swayX = 0.14 * Math.sin(time * 0.9 + this.swayPhaseX)
      + 0.06 * Math.sin(time * 0.37 + this.swayPhaseY);
    const swayY = 0.06 * Math.sin(time * 0.67 + this.swayPhaseY)
      + 0.03 * Math.sin(time * 1.3 + this.swayPhaseX);
    // Ease changing usage into the body; integrate slowed breathing to avoid phase jumps.
    const fatigueBlend = 1 - Math.exp(-3 * dt);
    const fatigueIntegral = this.fatigue * dt + (this.currentFatigue - this.fatigue) * fatigueBlend / 3;
    this.currentFatigue += (this.fatigue - this.currentFatigue) * fatigueBlend;
    const f = this.currentFatigue;
    this.breathDelay += fatigueIntegral * 0.35 * Math.PI / 2;
    const breath = Math.sin(time * Math.PI / 2 - this.breathDelay);
    const sway = 1 - 0.55 * f;

    return {
      headX: clamp(this.current.headX + swayX * sway, -1, 1),
      headY: clamp(this.current.headY + swayY * sway + breath * (0.006 + 0.004 * f) - 0.16 * f, -1, 1),
      bodyX: clamp(this.current.bodyX + breath * (0.02 + 0.015 * f), -1, 1),
      eyeOpen: clamp(Math.min(this.current.eyeOpen, 1 - 0.42 * f) * (1 - blink), 0, 1),
      mouthSmile: clamp(this.current.mouthSmile, -1, 1),
      brow: clamp(this.current.brow, -1, 1),
    };
  }

  private blinkInterval(): number {
    return 2500 + this.rng() * 3000;
  }
}
