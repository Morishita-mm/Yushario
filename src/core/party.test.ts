import { describe, expect, it } from "vitest";
import { agentAuthorized, agentTokenBytes, outsideRole, PARTY_ROLES, partyRole, partyEventTitle, partyEditFiles, roleIntroduction, type PartyMember } from "./party";
import { handoffScroll, summaryRequest } from "./party-scroll";
import type { QuestDetail } from "./quests";
import { Room } from "./room";

const member: PartyMember = { quest: "q", session: "s", role: "command", note: "Stay in src/core", writer: false, joinedAt: 1 };
describe("party authority", () => {
  it("accepts only complete, fixed-size random-token encodings", () => {
    expect(agentTokenBytes("a1".repeat(32))).toEqual(Array(32).fill(161));
    for (const token of [undefined, null, 1, "", "a".repeat(63), "a".repeat(65), "G".repeat(64), "a".repeat(64) + "\n"]) expect(agentTokenBytes(token)).toBeUndefined();
  });
  it("bounds command authority to a live session, matching token, and own quest", () => {
    for (const action of ["read", "note", "send", "invite", "review"]) expect(agentAuthorized(true, true, member, "q", action)).toBe(true);
    for (const action of ["done", "dropped", "delete", "permission", "assign", "state", "", "READ"]) expect(agentAuthorized(true, true, member, "q", action)).toBe(false);
    expect(agentAuthorized(false, true, member, "q", "read")).toBe(false);
    expect(agentAuthorized(true, false, member, "q", "note")).toBe(false);
    expect(agentAuthorized(true, true, undefined, "q", "read")).toBe(false);
    expect(agentAuthorized(true, true, member, "another-town-quest", "read")).toBe(false);
  });
  it("other party heroes can only read and leave notes", () => {
    for (const role of PARTY_ROLES.filter((role) => role !== "command")) {
      const hero = { ...member, role };
      for (const action of ["read", "note"]) expect(agentAuthorized(true, true, hero, "q", action)).toBe(true);
      for (const action of ["send", "invite", "review", "done", "delete"]) expect(agentAuthorized(true, true, hero, "q", action)).toBe(false);
    }
  });
  it("counts only successful, observed file edits, never a planned edit or failed tool", () => {
    expect(partyEditFiles({ state: "working", hook: "PostToolUse", tool: "Edit", target: "one.ts" })).toEqual(["one.ts"]);
    expect(partyEditFiles({ state: "working", hook: "PreToolUse", tool: "Edit", target: "one.ts" })).toEqual([]);
    expect(partyEditFiles({ state: "error", hook: "PostToolUse", tool: "Write", target: "one.ts" })).toEqual([]);
    expect(partyEditFiles({ state: "working", hook: "PostToolUse", tool: "Read", target: "one.ts" })).toEqual([]);
  });
  it("warns only when a non-writer changed files", () => {
    expect(outsideRole(member, ["one.ts"])).toBe(true);
    expect(outsideRole(member, [])).toBe(false);
    expect(outsideRole({ ...member, writer: true }, ["one.ts"])).toBe(false);
    expect(outsideRole(undefined, ["one.ts"])).toBe(false);
  });
  it("relabels system events, not authored text, after a language change", () => {
    expect(partyEventTitle("command", "しき Lucaから", "en")).toBe("From commander Luca");
    expect(partyEventTitle("outside-role", "Mira changed files outside their role", "ja")).toBe("Miraが やくわりの そとで ファイルを かえた");
    expect(partyEventTitle("note", "Keep this exact note", "ja")).toBe("Keep this exact note");
  });
  it("has editable introductions in both languages without deciding work", () => {
    expect(partyRole("captain")).toBe(false);
    for (const role of PARTY_ROLES) for (const language of ["ja", "en"] as const) {
      const draft = roleIntroduction({ ...member, role }, language);
      expect(draft).toContain(member.note);
      if (role === "command") expect(draft).toContain("yushario quest read");
    }
    expect(summaryRequest("ja")).toContain("目的・きめたこと・のこり・注意");
    expect(summaryRequest("en")).toContain("decisions");
  });
});
describe("ledger-only handoff", () => {
  const quest: QuestDetail = { id: "q", town: "t", title: "A title", purpose: "A purpose", state: "review", createdAt: 1, updatedAt: 3,
    worktreePath: "/tmp/base", worktreeBranch: "quest/one", events: [{ id: 1, quest: "q", kind: "report", at: 2, title: "ignored stored language", text: "The actual reply.",
      report: { kind: "scroll", files: ["one.ts"], tests: { passed: 0, failed: 0 }, failures: 0, tools: 1, startedAt: 1, endedAt: 2 } }] };
  it("copies facts and the last saved reply verbatim", () => {
    for (const language of ["ja", "en"] as const) {
      const scroll = handoffScroll(quest, [{ title: "An explicit check", mark: "stale" }], language);
      for (const fact of [quest.title, quest.purpose, "one.ts", "/tmp/base", "quest/one", "The actual reply.", `${language === "ja" ? "↺ ふるい" : "↺ Stale"} An explicit check`]) expect(scroll).toContain(fact);
    }
  });
  it("does not invent absent replies, files, or a summary", () => {
    expect(handoffScroll({ ...quest, events: [] }, [], "en")).toBe("Quest: A title\n\nPurpose: A purpose\n\nAcceptance checks:\n—\n\nChanged files:\n—\n\nBase: /tmp/base\nbranch: quest/one\n\nLast report: —");
  });
});
describe("visible commander requests", () => {
  it("keeps commander provenance and avoids a second line when a held request is submitted", () => {
    const room = new Room();
    room.apply({ state: "idle", agent: "hero", hook: "PartyRequest", detail: "Luca", text: "Please review" }, 1);
    room.apply({ state: "thinking", agent: "hero", hook: "UserPromptSubmit", text: "Please review" }, 2);
    expect(room.agents.get("hero")?.talk).toEqual([{ at: 1, from: "you", text: "Please review", commander: "Luca", partyPending: false }]);
    room.apply({ state: "thinking", agent: "hero", hook: "UserPromptSubmit", text: "A human request" }, 3);
    expect(room.agents.get("hero")?.talk).toHaveLength(2);
    room.apply({ state: "idle", agent: "hero", hook: "PartyRequest", detail: "Luca", text: "Check again" }, 4);
    room.apply({ state: "thinking", agent: "hero", hook: "UserPromptSubmit", text: "Check again\nAlso check the human's addition" }, 5);
    expect(room.agents.get("hero")?.talk.at(-1)?.text).toBe("Check again\nAlso check the human's addition");
  });
});
