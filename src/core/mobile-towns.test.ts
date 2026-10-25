import { describe, expect, it } from "vitest";
import { mobilePermissionHashInput, mobileResponseBodyValues, parseMobileResponseBody } from "./mobile-display";
import { MOBILE_TOWN_THEMES } from "./mobile-quests";

const hero = { id: "h", name: "勇者", town: "町", state: "idle", permissionPending: false, townId: "town-a" };
const permission = { id: "p", heroId: "h", heroName: "勇者", town: "町", tool: "Bash", summary: "確認", content: "echo test",
  omitted: 0, expiresAt: 123, contentHash: "A".repeat(43), townId: "town-a", work: null, change: null };
const quest = { id: "q", title: "題", town: "町", state: "open", updatedAt: 123, townId: "town-a" };
const report = { id: "r", questId: "q", questTitle: "題", title: "報告", success: null, at: 123, excerpt: "", text: null, townId: "town-a" };
const workHero = { id: "h", name: "勇者", preset: "Pi", weapon: null, accessory: null, busy: false, canTalk: false,
  active: false, questId: null, permissionGate: false, townId: "town-a", model: null, effort: null };
const base = { id: "b", name: "本拠地", townId: "town-a" };
const draft = { questId: "q", text: "", tactic: "obey", members: [], fits: [], editable: true, draftLost: false,
  departure: { state: "not-started", steps: [] }, townId: "town-a" };
const cases: [string, object, (row: object) => object][] = [
  ["status", hero, row => ({ heroes: [row] })],
  ["permissions", permission, row => ({ permissions: [row] })],
  ["quests", quest, row => ({ quests: [row], nextCursor: null })],
  ["quest-create", quest, row => ({ quest: row })],
  ["reports", report, row => ({ reports: [row], nextCursor: null })],
  ["quest-options", workHero, row => ({ allowWork: false, heroes: [row], bases: [base], presets: [] })],
  ["quest-options", base, row => ({ allowWork: false, heroes: [workHero], bases: [row], presets: [] })],
  ["quest-draft", draft, row => ({ draft: row })],
  ["quest-prepare", draft, row => ({ draft: row, heroId: null, delivery: "none" })],
  ["quest-form", draft, row => ({ draft: row })],
  ["quest-embark", draft, row => ({ draft: row, heroId: "h" })],
  ["quest-depart", draft, row => ({ draft: row })],
];

describe("mobile town context", () => {
  it("requires nullable townId on every town-owned response and includes it in signed values", () => {
    for (const [operation, row, body] of cases) {
      const parsed = parseMobileResponseBody(operation, body(row));
      expect(parsed, operation).toBeDefined();
      for (const townId of [null, "town-b"]) {
        const changed = parseMobileResponseBody(operation, body({ ...row, townId }));
        expect(changed).toBeDefined();
        expect(mobileResponseBodyValues(changed!)).not.toEqual(mobileResponseBodyValues(parsed!));
      }
      for (const townId of [undefined, "", 1, "x".repeat(201), "\ud800"]) {
        expect(parseMobileResponseBody(operation, body({ ...row, townId }))).toBeUndefined();
      }
      const { townId: _, ...missing } = row as Record<string, unknown>;
      expect(parseMobileResponseBody(operation, body(missing))).toBeUndefined();
    }
  });

  it("accepts exactly the five themes or explicit null, never a path or a missing theme", () => {
    const body = (theme: unknown) => ({ towns: [{ id: "town-a", name: "同じ町", theme }], nextCursor: null });
    const values: unknown[] = [];
    for (const theme of [...MOBILE_TOWN_THEMES, null]) {
      const response = parseMobileResponseBody("towns", body(theme));
      expect(response).toBeDefined(); values.push(mobileResponseBodyValues(response!));
    }
    expect(new Set(values.map(value => JSON.stringify(value))).size).toBe(6);
    for (const theme of [undefined, "unknown", "SNOW", "/private/snow", 0, {}]) {
      expect(parseMobileResponseBody("towns", body(theme))).toBeUndefined();
    }
  });

  it("binds permission grouping even when two towns have the same display label", () => {
    const hash = mobilePermissionHashInput(permission);
    expect(mobilePermissionHashInput({ ...permission, townId: "town-b" })).not.toEqual(hash);
    expect(mobilePermissionHashInput({ ...permission, townId: null })).not.toEqual(hash);
  });
});
