import { describe, expect, it } from "vitest";
import { namedHero, normalizeHeroName, validHeroNames } from "./names";

describe("hero names", () => {
  it("trims surrounding whitespace and accepts 1–24 characters", () => {
    expect(normalizeHeroName("  ゆうしゃ アルス　\n")).toBe("ゆうしゃ アルス");
    expect(normalizeHeroName("A")).toBe("A");
    expect(normalizeHeroName("  " + "勇".repeat(24) + "  ")).toBe("勇".repeat(24));
    expect(normalizeHeroName("勇".repeat(25))).toBeUndefined();
    for (const value of [null, undefined, 24, {}, [], true]) {
      expect(normalizeHeroName(value)).toBeUndefined();
    }
  });

  it("uses empty or whitespace-only names to remove the override", () => {
    for (const value of ["", " \t\r\n　", " ".repeat(100)]) expect(normalizeHeroName(value)).toBe("");
  });

  it("validates saved maps with the same Claude session ID rules", () => {
    expect(validHeroNames({})).toBe(true);
    expect(validHeroNames({ "claude-123": "アルス", ["a".repeat(200)]: "勇".repeat(24) })).toBe(true);
    for (const value of [null, [], "hero", { "a/b": "hero" }, { "--option": "hero" },
      { ["a".repeat(201)]: "hero" }, { a: "" }, { a: " hero " }, { a: "勇".repeat(25) }, { a: 1 }]) {
      expect(validHeroNames(value)).toBe(false);
    }
  });

  it("does not mistake inherited object properties for chosen names", () => {
    expect(namedHero({}, "constructor")).toBeUndefined();
    expect(namedHero({}, "toString")).toBeUndefined();
    expect(namedHero({ "claude-123": "アルス" }, "claude-123")).toBe("アルス");
    expect(namedHero({ constructor: "アルス" }, "constructor")).toBe("アルス");
    expect(namedHero({ "claude-123": "アルス" }, "other")).toBeUndefined();
  });
});
