import { afterEach, describe, expect, it, vi } from "vitest";
import type { Candidate, DecisionContext } from "../core/decider";
import { MockDecider } from "../core/mock-decider";
import { selectCandidate } from "../core/selector";
import { JevDecider } from "./jev-decider";

const previous: Candidate = { expression: "focused", posture: "tilt", gesture: "think", score: 1 };
const ctx: DecisionContext = {
  event: { state: "success", tool: "Edit" }, recent: [{ state: "working" }, { state: "success", tool: "Edit" }],
  previous, elapsedMs: 100,
};
function answer(choice: string, probabilities: Record<string, number>, confidence = 0.9) {
  return { type: "choice", choice, probabilities, confidence };
}
function response(gesture = "cheer") {
  return {
    model: "jev-latest",
    answers: {
      expression: answer("happy", { neutral: 0.05, focused: 0, happy: 0.9, troubled: 0, surprised: 0.05 }),
      posture: answer("upright", { upright: 0.9, lean_forward: 0, tilt: 0.1, slump: 0 }),
      gesture: answer(gesture, { none: 0, nod: 0, shake: 0, wave: 0, think: 0, cheer: 0, tremble: 0, [gesture]: 1 }),
    },
  };
}
const fakeFetch = (body: unknown) => vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body)));
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("JevDecider", () => {
  it("posts three documented choices and converts probability products to candidates", async () => {
    const fetcher = fakeFetch(response());
    const candidates = await new JevDecider("test-key", "jev-test", fetcher).decide(ctx);
    expect(candidates).toHaveLength(20);
    expect(selectCandidate(candidates, () => 0)).toEqual({ expression: "happy", posture: "upright", gesture: "cheer", score: 0.81 });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(init?.headers).toEqual({ Authorization: "Bearer test-key", "Content-Type": "application/json" });
    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe("jev-test");
    expect(body.state).toEqual({ event: ctx.event, recent: ctx.recent, previous });
    expect(Object.keys(body.questions)).toEqual(["expression", "posture", "gesture"]);
    expect(body.questions.gesture.criteria.none).toBeTypeOf("string");
    for (const question of Object.values(body.questions) as { type: string; criteria: Record<string, string> }[]) {
      expect(question.type).toBe("choice");
      expect(Object.values(question.criteria).every((description) => description.length > 0)).toBe(true);
    }
  });

  it("preserves previous expression and posture independently below the confidence threshold", async () => {
    for (const field of ["expression", "posture"] as const) {
      const body = response();
      body.answers[field].confidence = 0.49;
      const selected = selectCandidate(await new JevDecider("key", undefined, fakeFetch(body)).decide(ctx), () => 0);
      expect(selected[field]).toBe(previous[field]);
      if (field !== "expression") expect(selected.expression).toBe("happy");
      if (field !== "posture") expect(selected.posture).toBe("upright");
      expect(selected.gesture).toBe("cheer");
    }
  });

  it.each([previous, undefined])("omits low-confidence gestures instead of replaying a previous one (%j)", async (previous) => {
    const body = response();
    body.answers.gesture.confidence = 0.49;
    const candidates = await new JevDecider("key", undefined, fakeFetch(body)).decide({ ...ctx, previous });
    expect(candidates.every((candidate) => !("gesture" in candidate))).toBe(true);
    const selected = selectCandidate(candidates, () => 0);
    expect(selected.expression).toBe("happy");
    expect(selected.posture).toBe("upright");
  });

  it("omits a none gesture (including when there is no previous)", async () => {
    const candidates = await new JevDecider("key", undefined, fakeFetch(response("none"))).decide({ ...ctx, previous: undefined });
    expect(candidates.every((candidate) => !("gesture" in candidate))).toBe(true);
  });

  it.each([401, 429, 500])("falls back without retry for HTTP %s and warns once", async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("error", { status }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fallback = new MockDecider();
    expect(await new JevDecider("key", undefined, fetcher, fallback).decide(ctx)).toEqual(await fallback.decide(ctx));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("times out even an unresponsive fetch, aborts it, and falls back", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pending = new JevDecider("key", undefined, fetcher).decide(ctx);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await pending).toEqual(await new MockDecider().decide(ctx));
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it.each([{}, { answers: {} }, { answers: { expression: { type: "choice", choice: "unknown" } } }])(
    "falls back for malformed answers", async (body) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(await new JevDecider("key", undefined, fakeFetch(body)).decide(ctx)).toEqual(await new MockDecider().decide(ctx));
      expect(warn).toHaveBeenCalledTimes(1);
    },
  );

  it("does not fetch for repeated state and removes one-shot gesture like MockDecider", async () => {
    const fetcher = fakeFetch(response());
    const repeated = { ...ctx, recent: [{ state: "success" as const }, ctx.event] };
    const result = await new JevDecider("key", undefined, fetcher).decide(repeated);
    expect(result).toEqual(await new MockDecider().decide(repeated));
    expect(fetcher).not.toHaveBeenCalled();
  });
});
