import { describe, expect, it } from "vitest";
import { addRosterEntry, isClaudeSessionId, ROSTER_LIMIT, type RosterEntry } from "./roster";

const entry = (sessionId: string, leftAt = 1): RosterEntry => ({ sessionId, name: "hero", project: "town", cwd: "/town", leftAt });

describe("roster metadata", () => {
  it("accepts only short Claude session IDs starting with an alphanumeric character", () => {
    expect(isClaudeSessionId("64bb2a57-4f0b-4c57-9061-459c02796769")).toBe(true);
    for (const value of ["ABC-123", "A", "0", "a".repeat(200)]) expect(isClaudeSessionId(value)).toBe(true);
    for (const value of [null, 123, "", "-", "-x", "--foo", "--dangerously-skip-permissions",
      "../other", "a/b", "a_b", "a b", "x\n", "a".repeat(201)]) {
      expect(isClaudeSessionId(value)).toBe(false);
    }
  });

  it("keeps only the newest 50 entries without mutating the old roster", () => {
    const old = Array.from({ length: ROSTER_LIMIT }, (_, i) => entry(`session-${i}`, i + 1));
    const next = addRosterEntry(old, entry("new", 100));
    expect(next).toHaveLength(ROSTER_LIMIT);
    expect(next[0].sessionId).toBe("session-1");
    expect(next.at(-1)?.sessionId).toBe("new");
    expect(old[0].sessionId).toBe("session-0");
    expect(addRosterEntry(old, entry("very-old", 0))).toEqual(old);
  });

  it("retains only equipment IDs alongside departure metadata", () => {
    const next = addRosterEntry([], { ...entry("equipped"), weapon: "steel", accessory: "low", model: "secret" } as RosterEntry);
    expect(next[0]).toEqual({ ...entry("equipped"), weapon: "steel", accessory: "low" });
  });

  it("updates recalled conversations once and never copies conversation bodies", () => {
    const old = [entry("same"), entry("other", 2)];
    const next = addRosterEntry(old, { ...entry("same", 3), text: "secret", talk: ["secret"] } as RosterEntry);
    expect(next.map((item) => item.sessionId)).toEqual(["other", "same"]);
    expect(Object.keys(next[1])).toEqual(["sessionId", "name", "project", "cwd", "leftAt"]);
    expect(JSON.stringify(next)).not.toContain("secret");
  });
});
