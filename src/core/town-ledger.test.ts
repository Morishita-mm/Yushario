import { describe, expect, it } from "vitest";
import { activateTown, archiveTowns, DAY_MS, registerTown, storedSettings, townKey, townLabel, townNameForKey, validSettings, type TownRecord } from "./town-ledger";

const now = 100 * DAY_MS;
function town(overrides: Partial<TownRecord> = {}): TownRecord {
  return { name: "repo", path: "/repo", firstSeenAt: 0, lastActiveAt: 0, pinned: false, ...overrides };
}

describe("town settings", () => {
  it("loads old files and migrates boolean sound without changing the input or archive days", () => {
    expect(storedSettings({ archiveAfterDays: 7 })).toEqual({ archiveAfterDays: 7, sound: "all", language: "auto" });
    for (const sound of [true, false]) {
      const input = Object.freeze({ archiveAfterDays: 0, sound });
      expect(storedSettings(input)).toEqual({ archiveAfterDays: 0, sound: sound ? "all" : "off", language: "auto" });
      expect(validSettings(input)).toBe(false); // Legacy booleans are for reading files, not new API saves.
    }
  });

  it("accepts explicit conversation opt-in without opting legacy settings in", () => {
    const legacy = { archiveAfterDays: 30, sound: "all", language: "ja" };
    expect(storedSettings(legacy)?.saveConversation ?? false).toBe(false);
    for (const saveConversation of [false, true]) {
      const input = { ...legacy, saveConversation };
      expect(validSettings(input)).toBe(true);
      expect(storedSettings(input)?.saveConversation).toBe(saveConversation);
    }
    for (const saveConversation of ["true", 1, null, []]) expect(validSettings({ ...legacy, saveConversation })).toBe(false);
  });
  it("accepts all three modes and integer days in range for saves and stored files", () => {
    for (const sound of ["all", "follow", "off"]) {
      for (const archiveAfterDays of [0, 30, 365]) {
        const input = { archiveAfterDays, sound, language: "auto" };
        expect(validSettings(input)).toBe(true);
        expect(storedSettings(input)).toEqual(input);
      }
    }
    expect(validSettings({ archiveAfterDays: 30 })).toBe(false);
  });

  it("accepts the two languages and auto, migrates old files, and rejects other language values", () => {
    for (const language of ["auto", "ja", "en"]) {
      const input = Object.freeze({ archiveAfterDays: 30, sound: "follow", language });
      expect(validSettings(input)).toBe(true);
      expect(storedSettings(input)).toEqual(input);
    }
    expect(storedSettings({ archiveAfterDays: 14, sound: "off" })).toEqual({ archiveAfterDays: 14, sound: "off", language: "auto" });
    expect(validSettings({ archiveAfterDays: 30, sound: "all" })).toBe(false);
    for (const language of [undefined, null, "fr", "EN", true, 0, ["ja"]]) {
      const input = { archiveAfterDays: 30, sound: "all", language };
      expect(validSettings(input)).toBe(false);
      expect(storedSettings(input)).toBeUndefined();
    }
  });

  it("rejects invalid sound, days and extra keys, including in legacy files", () => {
    for (const input of [null, [], {}, { sound: "all" },
      { archiveAfterDays: -1, sound: "all" }, { archiveAfterDays: 366, sound: "all" },
      { archiveAfterDays: 1.5, sound: "all" }, { archiveAfterDays: "30", sound: "all" },
      { archiveAfterDays: NaN, sound: "all" }, { archiveAfterDays: Infinity, sound: "all" },
      { archiveAfterDays: 30, sound: "false" }, { archiveAfterDays: 30, sound: 0 },
      { archiveAfterDays: 30, sound: null }, { archiveAfterDays: 30, sound: undefined },
      { archiveAfterDays: 30, sound: ["all"] }, { archiveAfterDays: 30, sound: "ALL" },
      { archiveAfterDays: 30, sound: "all", extra: true }, { archiveAfterDays: 30, extra: true },
      { archiveAfterDays: 30, sound: true, extra: true }, { archiveAfterDays: -1, sound: false }]) {
      expect(validSettings(input)).toBe(false);
      expect(storedSettings(input)).toBeUndefined();
    }
  });
});

describe("town ledger", () => {
  it("registers a new project once with its directory and timestamps", () => {
    const original: TownRecord[] = [];
    const registered = registerTown(original, "repo", "/repo", now);
    expect(registered).toEqual([town({ firstSeenAt: now, lastActiveAt: now })]);
    expect(original).toEqual([]);
  });

  it("separates equal names by key and shares a key across worktree directories", () => {
    const a = registerTown([], "app", "/client/app", now, "/client/app/.git", "client");
    const both = registerTown(a, "app", "/personal/app", now, "/personal/app/.git", "personal");
    expect(both.map((record) => townLabel(record, both))).toEqual(["app（client）", "app（personal）"]);
    const shared = registerTown(both, "app", "/tmp/worktree", now + 1, "/client/app/.git", "client");
    expect(shared).toHaveLength(2);
    expect(shared[0].path).toBe("/tmp/worktree");
    expect(shared[1]).toBe(both[1]);
    expect(activateTown(shared, "/personal/app/.git", now + 2)[1].lastActiveAt).toBe(now + 2);
    expect(townKey(town())).toBe("repo");
    expect(townLabel(town(), [town()])).toBe("repo");
  });
  it("resolves archived names and never falls back to displaying a canonical path", () => {
    const records = [town({ key: "/client/app/.git", name: "app", parent: "client", archivedAt: 1 }),
      town({ key: "/personal/app/.git", name: "app", parent: "personal" })];
    expect(townNameForKey("/client/app/.git", records)).toBe("app（client）");
    expect(townNameForKey("/unknown/repo/.git", records)).toBe("repo");
    expect(townNameForKey("/unknown/folder", records)).toBe("folder");
    expect(townNameForKey("legacy-name", records)).toBe("legacy-name");
  });
  it("repairs an unresolved legacy name when its directory is registered again", () => {
    const legacy = town({ name: "app", theme: "snow", archivedAt: 1 });
    const repaired = registerTown([legacy], "app", "/client/app", now, "/client/app/.git", "client");
    expect(repaired).toHaveLength(1);
    expect(repaired[0]).toMatchObject({ key: "/client/app/.git", theme: "snow", lastActiveAt: now });
    expect(repaired[0].archivedAt).toBeUndefined();
    expect(legacy.key).toBeUndefined();
  });
  it("rejects an empty name without changing the existing ledger", () => {
    const original = [town()];
    expect(() => registerTown(original, "", "/", now)).toThrow("Invalid town name");
    expect(original).toEqual([town()]);
  });

  it("updates the last directory and restores a returning town without losing its appearance or pin", () => {
    const existing = town({ theme: "snow", pinned: true, archivedAt: 1 });
    const other = town({ name: "other" });
    Object.freeze(existing);
    const original = [existing, other];
    Object.freeze(original);
    const registered = registerTown(original, "repo", "/worktree", now);
    expect(registered).toEqual([
      town({ path: "/worktree", theme: "snow", pinned: true, lastActiveAt: now }), other,
    ]);
    expect(registered[1]).toBe(other);
    expect(original[0]).toHaveProperty("archivedAt", 1);
  });

  it("updates only the known town on an embedded hero event and clears archivedAt", () => {
    const original = [town({ theme: "port", archivedAt: 1 }), town({ name: "other" })];
    const activated = activateTown(original, "repo", now);
    expect(activated[0]).toEqual(town({ theme: "port", lastActiveAt: now }));
    expect(activated[0]).not.toHaveProperty("archivedAt");
    expect(activated[1]).toBe(original[1]);
    expect(original[0].lastActiveAt).toBe(0);
    expect(activateTown(original, "external", now)).toBe(original);
    expect(activateTown(activated, "repo", now)).toBe(activated);
  });

  it("archives only strictly older, unpinned towns without heroes", () => {
    const original = [
      town(),
      town({ name: "pinned", pinned: true }),
      town({ name: "active" }),
      town({ name: "boundary", lastActiveAt: now - 30 * DAY_MS }),
      town({ name: "recent", lastActiveAt: now - 30 * DAY_MS + 1 }),
      town({ name: "future", lastActiveAt: now + DAY_MS }),
      town({ name: "archived", archivedAt: 5 }),
    ];
    original.forEach(Object.freeze);
    Object.freeze(original);
    const archived = archiveTowns(original, new Set(["active"]), 30, now);
    expect(archived[0]).toEqual(town({ archivedAt: now }));
    expect(archived.slice(1)).toEqual(original.slice(1));
    expect(original[0]).not.toHaveProperty("archivedAt");
    expect(archiveTowns(archived, new Set(["active"]), 30, now)).toBe(archived);
  });

  it("does not archive anything when disabled, including old towns", () => {
    const original = [town(), town({ name: "archived", archivedAt: 5 })];
    expect(archiveTowns(original, new Set(), 0, now)).toBe(original);
  });

  it("retains appearance after automatic archiving and subsequent activity", () => {
    const archived = archiveTowns([town({ theme: "volcano" })], new Set(), 1, now);
    expect(archived[0].archivedAt).toBe(now);
    expect(activateTown(archived, "repo", now + 1)).toEqual([
      town({ theme: "volcano", lastActiveAt: now + 1 }),
    ]);
  });
});
