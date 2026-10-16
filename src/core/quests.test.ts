import { describe, expect, it } from "vitest";
import { ownerAnswer, questForRecall, questStateAfterEvent, questStateForParty, questTitle, savedQuestEvent, sortedQuests, validQuestPatch, type Quest, type QuestDetail } from "./quests";
import { askingAfterEvent } from "./session-actions";
import type { AgentEvent } from "./events";
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
  it("keeps A's question through B's activity/report until A answers", () => {
    const waiting = new Map<string, boolean>();
    let state = "active" as Quest["state"];
    const apply = (session: string, event: AgentEvent) => {
      const asking = askingAfterEvent(event);
      if (asking !== undefined) waiting.set(session, asking);
      state = questStateForParty(questStateAfterEvent(state, event), waiting.values());
      return state;
    };
    expect(apply("A", { state: "waiting_input", hook: "PermissionRequest" })).toBe("waiting");
    expect(apply("B", { state: "working", hook: "PostToolUse", tool: "Read" })).toBe("waiting");
    expect(apply("B", { state: "idle", hook: "Stop" })).toBe("waiting");
    expect(apply("A", { state: "working", hook: "PostToolUse", tool: "Bash" })).toBe("active");
    expect(questStateForParty("review", [false, false])).toBe("review");
    for (const state of ["done", "dropped"] as const) expect(questStateForParty(state, [true])).toBe(state);
  });
  it("keeps helper questions until the owning conversation resumes", () => {
    expect(questStateForParty("active", [askingAfterEvent({ state: "waiting_input", hook: "PermissionRequest", subagent: { id: "h" } }) === true])).toBe("waiting");
    expect(askingAfterEvent({ state: "idle", hook: "Stop", subagent: { id: "h" } })).toBeUndefined();
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

describe("the adopted answer is the owner's", () => {
  const report = (id: number, session: string, at: number, text?: string) => ({ id, quest: "q", kind: "report" as const, at, title: "r", session, ...(text ? { text } : {}) });
  const quest = (events: ReturnType<typeof report>[], writerSession = "owner"): QuestDetail => ({ id: "q", town: "t", title: "T", purpose: "", state: "review", createdAt: 0, updatedAt: 0, session: "owner", writerSession, events });
  it("takes the owner's reply in memory, not a commander's", () => {
    expect(ownerAnswer(quest([]), { at: 1, session: "owner", text: "OWNER" })).toBe("OWNER");
    expect(ownerAnswer(quest([report(1, "owner", 1, "SAVED_OWNER")]), { at: 9, session: "commander", text: "COMMANDER" })).toBe("SAVED_OWNER");
  });
  it("falls back to the owner's latest saved report, never a helper's", () => {
    expect(ownerAnswer(quest([report(1, "owner", 1, "OLD"), report(2, "owner", 2, "NEW"), report(3, "helper", 3, "HELPER")]))).toBe("NEW");
    expect(ownerAnswer(quest([report(1, "helper", 1, "HELPER")]))).toBeUndefined();
  });
  it("never falls back to an older text when the latest report kept none", () => {
    expect(ownerAnswer(quest([report(1, "owner", 1, "OLD_SAVED_REPLY"), report(2, "owner", 2)]))).toBeUndefined();
    expect(ownerAnswer(quest([report(1, "owner", 1, "OLD"), report(2, "owner", 2, "LATEST")]))).toBe("LATEST");
    expect(ownerAnswer(quest([report(1, "owner", 5, "FIRST"), report(2, "owner", 5)]))).toBeUndefined();
    expect(ownerAnswer(quest([report(2, "owner", 5, "SECOND"), report(1, "owner", 5)]))).toBe("SECOND");
    expect(ownerAnswer(quest([report(1, "owner", 1, "OWNER"), report(2, "helper", 2, "HELPER"), report(3, "commander", 3, "COMMANDER")]))).toBe("OWNER");
  });
  it("never keeps an earlier reply after a later turn ended without text", () => {
    // 1. answer, next request, failure without text: the failure's report is newer than the cached answer.
    expect(ownerAnswer(quest([report(1, "owner", 200), report(2, "owner", 400)]), { at: 200, session: "owner", text: "PREVIOUS_SUCCESS_ANSWER" })).toBeUndefined();
    // 2. the cache itself now holds the newer textless end.
    expect(ownerAnswer(quest([report(1, "owner", 200)]), { at: 400, session: "owner" })).toBeUndefined();
    // 3. a newer answer with text is the answer.
    expect(ownerAnswer(quest([report(1, "owner", 200)]), { at: 400, session: "owner", text: "NEW" })).toBe("NEW");
    // the saved latest report wins over an older cache when its text was kept.
    expect(ownerAnswer(quest([report(1, "owner", 400, "SAVED_NEW")]), { at: 200, session: "owner", text: "OLD" })).toBe("SAVED_NEW");
  });
  it("follows an owner change", () => {
    expect(ownerAnswer(quest([report(1, "owner", 1, "OLD_OWNER")], "newcomer"), { at: 9, session: "owner", text: "OLD_OWNER_REPLY" })).toBeUndefined();
  });
});
