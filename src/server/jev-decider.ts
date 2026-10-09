import type { Candidate, Decider, DecisionContext, Expression, Gesture, Posture } from "../core/decider";
import { MockDecider } from "../core/mock-decider";

const CONFIDENCE_THRESHOLD = 0.5;
const EXPRESSIONS: Record<Expression, string> = {
  neutral: "Calm, relaxed face", focused: "Attentive, concentrating face",
  happy: "Joyful, smiling face", troubled: "Worried, sad face", surprised: "Startled, wide-eyed face",
};
const POSTURES: Record<Posture, string> = {
  upright: "Balanced, confident stance", lean_forward: "Engaged, leaning toward the work",
  tilt: "Curious, head tilted", slump: "Discouraged, shoulders lowered",
};
const GESTURES: Record<Gesture | "none", string> = {
  none: "No one-shot movement needed", nod: "Brief affirmative nod", shake: "Brief negative head shake",
  wave: "Wave to invite attention", think: "Thoughtful hand-to-chin movement",
  cheer: "Celebrate a successful result", tremble: "Tremble with distress after repeated errors",
};

function choiceQuestion(instructions: string, criteria: Record<string, string>) {
  return { type: "choice", instructions, criteria };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Jev response");
  return value as Record<string, unknown>;
}

function probability(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function readChoice<T extends string>(value: unknown, criteria: Record<T, string>) {
  const answer = object(value);
  const keys = Object.keys(criteria) as T[];
  const probabilities = object(answer.probabilities);
  if (answer.type !== "choice" || !keys.includes(answer.choice as T) || !probability(answer.confidence)
    || Object.keys(probabilities).length !== keys.length || !keys.every((key) => probability(probabilities[key]))) {
    throw new Error("Invalid Jev choice");
  }
  const distribution = probabilities as Record<T, number>;
  if (Math.abs(keys.reduce((sum, key) => sum + distribution[key], 0) - 1) > 0.01) {
    throw new Error("Invalid Jev probabilities");
  }
  return { choice: answer.choice as T, confidence: answer.confidence, probabilities: distribution };
}

export class JevDecider implements Decider {
  constructor(
    private readonly apiKey: string,
    private readonly model = "jev-latest",
    private readonly fetcher: typeof fetch = fetch,
    private readonly fallback: Decider = new MockDecider(),
    private readonly timeoutMs = 3000,
  ) {}

  async decide(ctx: DecisionContext): Promise<Candidate[]> {
    if (ctx.previous && ctx.recent.at(-2)?.state === ctx.event.state) {
      const { gesture: _, ...previous } = ctx.previous;
      return [{ ...previous, score: 2 }];
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Jev timeout"));
        }, this.timeoutMs);
      });
      const result = await Promise.race([
        (async () => {
          const response = await this.fetcher("https://api.typesafe.ai/v1/systemone", {
            method: "POST",
            headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              model: this.model,
              state: { event: ctx.event, recent: ctx.recent, previous: ctx.previous },
              questions: {
                expression: choiceQuestion("Which facial emotion fits the agent's current activity and recent history?", EXPRESSIONS),
                posture: choiceQuestion("Which body posture expresses the agent's current activity?", POSTURES),
                gesture: choiceQuestion("Which brief physical gesture fits this state transition?", GESTURES),
              },
            }),
          });
          if (!response.ok) throw new Error(`Jev HTTP ${response.status}`);
          return response.json() as Promise<unknown>;
        })(),
        timeout,
      ]);
      const answers = object(object(result).answers);
      const expression = readChoice(answers.expression, EXPRESSIONS);
      const posture = readChoice(answers.posture, POSTURES);
      const gesture = readChoice(answers.gesture, GESTURES);
      const expressions: [Expression, number][] = expression.confidence < CONFIDENCE_THRESHOLD && ctx.previous
        ? [[ctx.previous.expression, 1]] : Object.entries(expression.probabilities) as [Expression, number][];
      const postures: [Posture, number][] = posture.confidence < CONFIDENCE_THRESHOLD && ctx.previous
        ? [[ctx.previous.posture, 1]] : Object.entries(posture.probabilities) as [Posture, number][];
      const selectedGesture = gesture.confidence < CONFIDENCE_THRESHOLD || gesture.choice === "none"
        ? undefined : gesture.choice;
      return expressions.flatMap(([expression, ep]) => postures.map(([posture, pp]) => ({
        expression, posture, score: ep * pp, ...(selectedGesture ? { gesture: selectedGesture } : {}),
      })));
    } catch {
      console.warn("JevDecider request failed or invalid; using MockDecider fallback");
      return this.fallback.decide(ctx);
    } finally {
      clearTimeout(timer);
    }
  }
}
