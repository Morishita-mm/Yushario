import { describe, expect, it } from "vitest";
import { questForRecall, questStateAfterEvent, questTitle, savedQuestEvent, sortedQuests, validQuestPatch, type Quest } from "./quests";
import { registerTown, townKey, townLabel } from "./town-ledger";

describe("persistent quests", () => {
  it("takes only the first 60 characters of the request's first line", () => {
    expect(questTitle("first line\nprivate body")).toBe("first line");
    expect(questTitle("x".repeat(100))).toHaveLength(60);
    expect(questTitle("x".repeat(59) + "😀")).toBe("x".repeat(59));
    expect(questTitle("\nsecret")).toBe("…");
  });
  it("follows work, judgment waits, reports and a new request", () => {
    let state = questStateAfterEvent("open", { state: "working", hook: "UserPromptSubmit" });
    expect(state).toBe("active");
    state = questStateAfterEvent(state, { state: "waiting_input", hook: "PermissionRequest" }); expect(state).toBe("waiting");
    state = questStateAfterEvent(state, { state: "working", hook: "PostToolUse", tool: "Read" }); expect(state).toBe("active");
    state = questStateAfterEvent(state, { state: "idle", hook: "Stop" }); expect(state).toBe("review");
    expect(questStateAfterEvent(state, { state: "working", hook: "UserPromptSubmit" })).toBe("active");
  });
  it("never replaces a human's done/dropped decision and ignores helper reports", () => {
    for (const state of ["done", "dropped"] as const) expect(questStateAfterEvent(state, { state: "working", hook: "UserPromptSubmit" })).toBe(state);
    expect(questStateAfterEvent("active", { state: "idle", hook: "Stop", subagent: { id: "helper" } })).toBe("active");
  });
  it("drops conversation bodies unless chosen and never loses the request title", () => {
    const event = { quest: "q", kind: "request" as const, at: 1, title: "first line", text: "first line\nprivate" };
    expect(savedQuestEvent(event, false)).toEqual({ quest: "q", kind: "request", at: 1, title: "first line" });
    expect(savedQuestEvent(event, true)).toEqual(event);
    expect(event.text).toContain("private");
  });
  it("recalls the last quest even after a terminal has switched to another conversation", () => {
    const old = { id: "old", town: "app-key", hero: "hero-a", updatedAt: 10 } as Quest;
    const other = { id: "other", town: "app-key", hero: "hero-b", updatedAt: 20 } as Quest;
    const bindings = [{ session: "terminal", quest: "other", hero: "hero-b" }];
    expect(questForRecall([old, other], bindings, "hero-a", "app-key")).toBe(old);
    expect(questForRecall([old, other], bindings, "hero-b", "app-key")).toBe(other);
    expect(questForRecall([old, other], bindings, "hero-a", "another-key")).toBeUndefined();
  });
  it("rejects bad edits and sorts the waiting quests first", () => {
    expect(validQuestPatch({ title: "new", purpose: "one line", state: "done" })).toBe(true);
    for (const value of [{ title: " " }, { purpose: "x".repeat(2001) }, { state: "success" }, { extra: true }]) expect(validQuestPatch(value)).toBe(false);
    const quests = ["open", "active", "review", "waiting"].map((state) => ({ state, updatedAt: 0 }) as Quest);
    expect(sortedQuests(quests).map((quest) => quest.state)).toEqual(["waiting", "review", "active", "open"]);
  });
});
describe("town identity", () => {
  it("keeps same-name repositories separate and adds their parents", () => {
    let towns = registerTown([], "app", "/client/app", 1, "/client/app/.git", "client");
    towns = registerTown(towns, "app", "/personal/app", 2, "/personal/app/.git", "personal");
    expect(towns.map(townKey)).toEqual(["/client/app/.git", "/personal/app/.git"]);
    expect(towns.map((town) => townLabel(town, towns))).toEqual(["app（client）", "app（personal）"]);
    expect(registerTown(towns, "app", "/worktree", 3, "/client/app/.git", "client")).toHaveLength(2);
  });
  it("repairs an unresolved legacy name on its next arrival", () => {
    const towns = registerTown([], "app", "/missing/app", 1);
    expect(registerTown(towns, "app", "/client/app", 2, "/client/app/.git", "client")[0].key).toBe("/client/app/.git");
  });
});
