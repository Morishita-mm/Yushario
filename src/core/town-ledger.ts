export const TOWN_THEMES = ["village", "port", "snow", "desert", "volcano"] as const;
export type TownTheme = typeof TOWN_THEMES[number];
export type TownRecord = {
  name: string;
  path: string;
  theme?: TownTheme;
  firstSeenAt: number;
  lastActiveAt: number;
  pinned: boolean;
  archivedAt?: number;
};
export type SoundMode = "all" | "follow" | "off";
export type TownSettings = { archiveAfterDays: number; sound: SoundMode };

export function validSettings(input: unknown): input is TownSettings {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>;
  return Object.keys(value).length === 2 && ["all", "follow", "off"].includes(value.sound as string)
    && typeof value.archiveAfterDays === "number" && Number.isInteger(value.archiveAfterDays)
    && value.archiveAfterDays >= 0 && value.archiveAfterDays <= 365;
}

// Only files written before sound was introduced may omit it.
export function storedSettings(input: unknown): TownSettings | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return;
  const value: Record<string, unknown> = { sound: "all", ...input };
  // Migrate the former on/off preference only when reading a saved file.
  if (value.sound === true) value.sound = "all";
  if (value.sound === false) value.sound = "off";
  return validSettings(value) ? value : undefined;
}

export const DAY_MS = 24 * 60 * 60 * 1000;

// Only the server calls this for a successfully created embedded terminal.
export function registerTown(towns: TownRecord[], name: string, path: string, now: number): TownRecord[] {
  if (!name) throw new Error("Invalid town name");
  const existing = towns.find((town) => town.name === name);
  if (!existing) return [...towns, { name, path, firstSeenAt: now, lastActiveAt: now, pinned: false }];
  return activateTown(towns.map((town) => town === existing ? { ...town, path } : town), name, now);
}

// Events must first be associated with a terminal owned by this server.
export function activateTown(towns: TownRecord[], name: string, now: number): TownRecord[] {
  const next = towns.map((town) => {
    if (town.name !== name || (town.lastActiveAt === now && town.archivedAt === undefined)) return town;
    const { archivedAt: _archivedAt, ...rest } = town;
    return { ...rest, lastActiveAt: now };
  });
  return next.some((town, index) => town !== towns[index]) ? next : towns;
}

export function archiveTowns(
  towns: TownRecord[], activeNames: ReadonlySet<string>, archiveAfterDays: number, now: number,
): TownRecord[] {
  if (archiveAfterDays === 0) return towns;
  const next = towns.map((town) => town.archivedAt === undefined && !town.pinned
    && !activeNames.has(town.name) && now - town.lastActiveAt > archiveAfterDays * DAY_MS
    ? { ...town, archivedAt: now } : town);
  return next.some((town, index) => town !== towns[index]) ? next : towns;
}
