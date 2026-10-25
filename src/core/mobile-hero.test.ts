import { describe, expect, it } from "vitest";
import { heroVariant } from "./mobile-hero";
import { mobileResponseBodyValues, parseMobileResponseBody } from "./mobile-display";

const hero = { id: "h", name: "勇者", town: "町", state: "idle", permissionPending: false, townId: "t", variant: 0 };
const workHero = { id: "h", name: "勇者", preset: "pi", weapon: null, accessory: null, busy: false, canTalk: true,
  active: true, questId: null, permissionGate: false, townId: "t", model: null, effort: null, variant: 0 };

describe("A6 hero colour contract", () => {
  it("keeps the PC's unsigned 31-based hash and five variants", () => {
    expect(["", "a", "b", "c", "d", "e", "hero-1", "勇者", "😀"].map(heroVariant)).toEqual([0, 2, 3, 4, 0, 1, 4, 4, 2]);
    expect(heroVariant("long-internal-id-".repeat(50))).toBe(2);
  });
  it("requires exactly 0..4 on Hero and WorkHero and signs every variant", () => {
    for (const [operation, row, body] of [
      ["status", hero, (h: object) => ({ heroes: [h] })],
      ["quest-options", workHero, (h: object) => ({ allowWork: false, heroes: [h], bases: [], presets: [] })],
    ] as const) {
      const signed = [];
      for (const variant of [0, 1, 2, 3, 4]) {
        const response = parseMobileResponseBody(operation, body({ ...row, variant }));
        expect(response).toBeDefined(); signed.push(JSON.stringify(mobileResponseBodyValues(response!)));
      }
      expect(new Set(signed).size).toBe(5);
      for (const variant of [undefined, null, -1, 5, 1.5, NaN, Infinity, "2", true, {}]) {
        expect(parseMobileResponseBody(operation, body({ ...row, variant }))).toBeUndefined();
      }
      const { variant: _, ...missing } = row;
      expect(parseMobileResponseBody(operation, body(missing))).toBeUndefined();
      expect(parseMobileResponseBody(operation, body({ ...row, color: "red" }))).toBeUndefined();
    }
  });
});
