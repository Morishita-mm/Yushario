import { describe, expect, it } from "vitest";
import { previousHero, questRound, questStage, stepIndex, yourTurn } from "./quest-stage";

describe("quest stage", () => {
  it("reads the person's next step from the state and owner", () => {
    expect(questStage({ state: "open" })).toBe("assign");
    expect(questStage({ state: "open", session: "s1" })).toBe("send");
    expect(questStage({ state: "active", session: "s1" })).toBe("work");
    expect(questStage({ state: "waiting", session: "s1" })).toBe("waiting");
    expect(questStage({ state: "review", session: "s1" })).toBe("review");
    expect(questStage({ state: "done" })).toBe("done");
    expect(questStage({ state: "dropped" })).toBe("dropped");
    expect(questStage({ state: "active" })).toBe("assign");
    expect(questStage({ state: "waiting" })).toBe("assign");
    expect(questStage({ state: "review" })).toBe("review");
    expect(questStage({ state: "active", session: "s1" }, false)).toBe("assign");
  });
  it("says whose turn it is", () => {
    expect(["assign", "send", "work", "waiting", "review", "done"].map((stage) => yourTurn(stage as never)))
      .toEqual([true, true, false, true, true, false]);
    expect(stepIndex("send")).toBe(2);
    expect(stepIndex("waiting")).toBe(stepIndex("work"));
  });
  it("counts rounds by reports, including the one in progress", () => {
    const events = [{ kind: "request" as const }, { kind: "report" as const }, { kind: "request" as const }];
    expect(questRound(events, "review")).toBe(1);
    expect(questRound(events, "work")).toBe(2);
    expect(questRound([], "send")).toBe(0);
  });
  it("names the previous owner only right after a change", () => {
    const events = [
      { kind: "assigned" as const, hero: "mina", at: 1 },
      { kind: "report" as const, hero: "mina", at: 2 },
      { kind: "handoff" as const, hero: "riku", at: 3 },
    ];
    expect(previousHero(events, "riku")).toBe("mina");
    expect(previousHero(events, "mina")).toBeUndefined();
    expect(previousHero(events.slice(0, 2), "mina")).toBeUndefined();
    expect(previousHero(events, undefined)).toBeUndefined();
  });
});
