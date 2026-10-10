import { describe, expect, it } from "vitest";
import { activateTown, archiveTowns, DAY_MS, registerTown, type TownRecord } from "./town-ledger";

const now = 100 * DAY_MS;
function town(overrides: Partial<TownRecord> = {}): TownRecord {
  return { name: "repo", path: "/repo", firstSeenAt: 0, lastActiveAt: 0, pinned: false, ...overrides };
}

describe("town ledger", () => {
  it("registers a new project once with its directory and timestamps", () => {
    const original: TownRecord[] = [];
    const registered = registerTown(original, "repo", "/repo", now);
    expect(registered).toEqual([town({ firstSeenAt: now, lastActiveAt: now })]);
    expect(original).toEqual([]);
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
