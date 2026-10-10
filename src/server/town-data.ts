import { randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { TOWN_THEMES, type TownRecord, type TownSettings, type TownTheme } from "../core/town-ledger";
import { isClaudeSessionId, ROSTER_LIMIT, type RosterEntry } from "../core/roster";
import { validHeroNames, type HeroNames } from "../core/names";
import { AGENTS, PRESETS, type Preset } from "./agents";
export type StoredRosterEntry = RosterEntry & { preset?: Preset };

const directory = process.env.AGENT_CHARACTER_HOME || join(homedir(), ".config", "agent-character");
mkdirSync(directory, { recursive: true, mode: 0o700 });

export function validSettings(input: unknown): input is TownSettings {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>;
  return Object.keys(value).length === 1 && typeof value.archiveAfterDays === "number"
    && Number.isInteger(value.archiveAfterDays) && value.archiveAfterDays >= 0 && value.archiveAfterDays <= 365;
}

export function validTheme(input: unknown): input is TownTheme {
  return TOWN_THEMES.includes(input as TownTheme);
}

function validTowns(input: unknown): input is TownRecord[] {
  if (!Array.isArray(input)) return false;
  const names = new Set<string>();
  return input.every((town: unknown) => {
    if (!town || typeof town !== "object" || Array.isArray(town)) return false;
    const value = town as Record<string, unknown>;
    const timestamp = (input: unknown): boolean => typeof input === "number" && Number.isFinite(input) && input >= 0;
    if (typeof value.name !== "string" || !value.name || names.has(value.name)
      || typeof value.path !== "string" || !isAbsolute(value.path)
      || !timestamp(value.firstSeenAt) || !timestamp(value.lastActiveAt) || typeof value.pinned !== "boolean"
      || (value.theme !== undefined && !validTheme(value.theme))
      || (value.archivedAt !== undefined && !timestamp(value.archivedAt))) return false;
    names.add(value.name);
    return true;
  });
}

function read(file: string): unknown {
  return JSON.parse(readFileSync(join(directory, file), "utf8"));
}

function quarantine(file: string, error: unknown): void {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
  console.warn(`Cannot read ${file}; starting with defaults:`, error instanceof Error ? error.message : String(error));
  try { renameSync(join(directory, file), join(directory, `${file}.broken`)); }
  catch (error) { console.warn(`Cannot quarantine ${file}:`, error instanceof Error ? error.message : String(error)); }
}

export function readTowns(): TownRecord[] {
  try {
    const input = read("towns.json");
    if (!validTowns(input)) throw new Error("Invalid town records");
    return input;
  } catch (error) { quarantine("towns.json", error); return []; }
}

export function readSettings(): TownSettings {
  try {
    const input = read("settings.json");
    if (!validSettings(input)) throw new Error("Invalid settings");
    return input;
  } catch (error) { quarantine("settings.json", error); return { archiveAfterDays: 30 }; }
}

export function readRoster(): StoredRosterEntry[] {
  try {
    const input = read("roster.json");
    const ids = new Set<string>();
    if (!Array.isArray(input) || !input.every((entry: unknown) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
      const value = entry as Record<string, unknown>;
      if (Object.keys(value).some((key) => !["sessionId", "name", "project", "cwd", "leftAt", "preset"].includes(key))
        || (value.preset !== undefined && (!PRESETS.includes(value.preset as Preset) || !AGENTS[value.preset as Preset].resume))
        || !isClaudeSessionId(value.sessionId) || ids.has(value.sessionId)
        || typeof value.name !== "string" || !value.name || typeof value.project !== "string" || !value.project
        || typeof value.cwd !== "string" || !isAbsolute(value.cwd)
        || typeof value.leftAt !== "number" || !Number.isFinite(value.leftAt) || value.leftAt < 0) return false;
      ids.add(value.sessionId);
      return true;
    })) throw new Error("Invalid roster records");
    return (input as StoredRosterEntry[]).sort((a, b) => a.leftAt - b.leftAt).slice(-ROSTER_LIMIT);
  } catch (error) { quarantine("roster.json", error); return []; }
}

export function readNames(): HeroNames {
  try {
    const input = read("names.json");
    if (!validHeroNames(input)) throw new Error("Invalid hero names");
    return input;
  } catch (error) { quarantine("names.json", error); return {}; }
}

// Synchronous writes keep concurrent hooks ordered; rename never exposes a partial JSON file.
function write(file: string, value: TownRecord[] | TownSettings | RosterEntry[] | HeroNames): void {
  const path = join(directory, file);
  const temporary = `${path}.${randomUUID()}.tmp`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    try { writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`); }
    finally { closeSync(descriptor); }
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function writeTowns(towns: TownRecord[]): void { write("towns.json", towns); }
export function writeSettings(settings: TownSettings): void { write("settings.json", settings); }
export function writeRoster(roster: StoredRosterEntry[]): void { write("roster.json", roster); }
export function writeNames(names: HeroNames): void { write("names.json", names); }
