import { describe, expect, it } from "vitest";
import { mobileHeroName, namedHero, normalizeHeroName, validHeroNames } from "./names";
import { Room } from "./room";
import { townView } from "./town";

describe("mobile hero names", () => {
  const assigned = (base: string, name = base) => ({ base, name });
  it("uses chosen names first, replacing only exact town or folder bases", () => {
    expect(mobileHeroName("testtown", assigned("testtown"), ["testtown"], "pi")).toBe("testtown");
    expect(mobileHeroName(undefined, assigned("testtown"), ["表示名", "testtown"], "Claude Code")).toBe("Claude Code 1");
    expect(mobileHeroName(undefined, assigned("表示名", "表示名 (3)"), ["表示名", "testtown"], "Codex")).toBe("Codex 3");
    expect(mobileHeroName(undefined, assigned("testtown", "testtown (2)"), ["testtown"])).toBe("勇者 2");
    expect(mobileHeroName(undefined, assigned("worktree", "worktree (2)"), ["testtown"], "pi")).toBe("worktree (2)");
    expect(mobileHeroName(undefined, assigned("testtown-more"), ["testtown"], "pi")).toBe("testtown-more");
    expect(mobileHeroName(undefined, assigned("testtown"), [], "pi")).toBe("testtown");
  });
  it("keeps TownNames lifetime numbers, not per-kind or visible-list counts", () => {
    const room = new Room();
    const add = (id: string) => room.apply({ agent: id, name: "testtown", project: "town", state: "idle" }, 1);
    add("one"); add("two");
    const history = townView(room, 1).names;
    room.apply({ agent: "one", state: "idle", hook: "SessionEnd" }, 2); add("three");
    const names = townView(room, 3, history).names;
    expect(mobileHeroName(undefined, names.find(n => n.id === "two")!, ["testtown"], "pi")).toBe("pi 2");
    expect(mobileHeroName(undefined, names.find(n => n.id === "three")!, ["testtown"], "Codex")).toBe("Codex 3");
  });
});

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
