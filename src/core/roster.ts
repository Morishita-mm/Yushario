import { MAX_EVENT_METADATA_LENGTH } from "./events";
import type { Equipment } from "./equipment";

// project is the town key, not its display name.
export type RosterEntry = { sessionId: string; name: string; project: string; cwd: string; leftAt: number } & Equipment;
export const ROSTER_LIMIT = 50;

export function isClaudeSessionId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_EVENT_METADATA_LENGTH
    && /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(value);
}

// Keep metadata only, one entry per Claude conversation, and discard the oldest beyond the limit.
export function addRosterEntry(roster: readonly RosterEntry[], entry: RosterEntry): RosterEntry[] {
  const { sessionId, name, project, cwd, leftAt, weapon, accessory } = entry;
  return [...roster.filter((item) => item.sessionId !== sessionId), { sessionId, name, project, cwd, leftAt,
    ...(weapon ? { weapon } : {}), ...(accessory ? { accessory } : {}) }]
    .sort((a, b) => a.leftAt - b.leftAt).slice(-ROSTER_LIMIT);
}
