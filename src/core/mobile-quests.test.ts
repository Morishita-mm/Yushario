import { describe, expect, it } from "vitest";
import { mobileQuestRequestTime, mobileRequestBodyValues, parseMobileRequestBody } from "./mobile-protocol";
import { mobileResponseBodyValues, parseMobileResponseBody } from "./mobile-display";

const requestId = "1700000000000.AAAAAAAAAAAAAAAAAAAAAA";
const create = { requestId, townId: "opaque-town", title: " 題😀 ", purpose: "目的\n次の行" };
const quest = { id: "quest-1", title: "題😀", town: "町", state: "open", updatedAt: 123, townId: "town-1" };
const report = { id: "report-1", questId: quest.id, questTitle: quest.title, title: "報告", success: null, at: 123, excerpt: "先頭", text: "全文😀", townId: "town-1" };

describe("mobile quest protocol", () => {
  it("requires exact bounded creation and paging inputs without normalizing signed text", () => {
    expect(parseMobileRequestBody("quest-create", create)).toEqual({ operation: "quest-create", body: create });
    for (const patch of [{ title: " " }, { title: "x".repeat(201) }, { purpose: "x".repeat(2001) }, { title: "\ud800" },
      { townId: "" }, { requestId: "uuid-only" }, { session: "terminal" }, { state: "active" }, { command: "echo no" }]) {
      expect(parseMobileRequestBody("quest-create", { ...create, ...patch })).toBeUndefined();
    }
    expect(parseMobileRequestBody("quest-create", { ...create, title: "x".repeat(200), purpose: "x".repeat(2000) })).toBeDefined();
    for (const operation of ["towns", "quests"]) {
      expect(parseMobileRequestBody(operation, { cursor: null })).toBeDefined();
      expect(parseMobileRequestBody(operation, {})).toBeUndefined();
      expect(parseMobileRequestBody(operation, { cursor: "" })).toBeUndefined();
    }
    expect(parseMobileRequestBody("reports", {})).toBeDefined();
    expect(parseMobileRequestBody("reports", { questId: "q", cursor: null })).toBeDefined();
    expect(parseMobileRequestBody("reports", { questId: "q", cursor: null, cwd: "/no" })).toBeUndefined();
    expect(mobileQuestRequestTime(requestId)).toBe(1700000000000);
    for (const value of ["01.AAAAAAAAAAAAAAAAAAAAAA", "9007199254740992.AAAAAAAAAAAAAAAAAAAAAA", "0.AAAAAAAAAAAAAAAAAAAAAB"]) {
      expect(mobileQuestRequestTime(value)).toBeUndefined();
    }
  });

  it("signs every new field in fixed array order, including cursors and full report text", () => {
    for (const [op, body, values] of [
      ["quest-create", create, [requestId, "opaque-town", " 題😀 ", "目的\n次の行"]],
      ["towns", { cursor: null }, [null]], ["quests", { cursor: "q" }, ["q"]],
      ["reports", { questId: "q", cursor: "r" }, ["q", "r"]],
    ] as const) expect(mobileRequestBodyValues(parseMobileRequestBody(op, body)!)).toEqual(values);
    const qv = ["quest-1", "題😀", "町", "open", 123, "town-1"];
    for (const [op, body, values] of [
      ["towns", { towns: [{ id: "town-1", name: "町", theme: "port" }], nextCursor: "town-1" }, [[["town-1", "町", "port"]], "town-1"]],
      ["quests", { quests: [quest], nextCursor: null }, [[qv], null]],
      ["quest-create", { quest }, [qv]],
      ["reports", { reports: [report], nextCursor: null }, [[["report-1", "quest-1", "題😀", "報告", null, 123, "先頭", "全文😀", "town-1"]], null]],
    ] as const) expect(mobileResponseBodyValues(parseMobileResponseBody(op, body)!)).toEqual(values);
  });

  it("rejects private metadata, malformed states and oversized full-text pages", () => {
    expect(parseMobileResponseBody("quests", { quests: [{ ...quest, cwd: "/private/repo" }], nextCursor: null })).toBeUndefined();
    expect(parseMobileResponseBody("quest-create", { quest: { ...quest, state: "running" } })).toBeUndefined();
    expect(parseMobileResponseBody("reports", { reports: [{ ...report, result: { branch: "secret" } }], nextCursor: null })).toBeUndefined();
    expect(parseMobileResponseBody("reports", { reports: [{ ...report, text: "a".repeat(8001) }], nextCursor: null })).toBeUndefined();
    expect(parseMobileResponseBody("reports", { reports: Array(9).fill(report), nextCursor: null })).toBeUndefined();
    expect(parseMobileResponseBody("reports", { reports: [{ ...report, text: null, excerpt: "" }], nextCursor: null })).toBeDefined();
  });
});
