export const TOWN_THEMES = ["village", "port", "snow", "desert", "volcano"] as const;
export type TownTheme = typeof TOWN_THEMES[number];
export type TownRecord = {
  name: string;
  key?: string;
  parent?: string;
  path: string;
  theme?: TownTheme;
  firstSeenAt: number;
  lastActiveAt: number;
  pinned: boolean;
  archivedAt?: number;
};
export type SoundMode = "all" | "follow" | "off";
export type Language = "ja" | "en";
export type TownSettings = { archiveAfterDays: number; sound: SoundMode; language: "auto" | Language; saveConversation?: boolean };
export const townKey = (town: TownRecord): string => town.key ?? town.name;
export function townLabel(town: TownRecord, towns: TownRecord[]): string {
  return towns.filter((other) => other.name === town.name).length > 1
    ? `${town.name}（${town.parent ?? town.path.split("/").filter(Boolean).slice(-2, -1)[0] ?? ""}）` : town.name;
}

export function townNameForKey(key: string, towns: TownRecord[]): string {
  const record = towns.find((town) => townKey(town) === key);
  if (record) return townLabel(record, towns);
  const parts = key.split("/").filter(Boolean);
  if (parts.at(-1) === ".git") parts.pop();
  return parts.at(-1) ?? key;
}

export function validSettings(input: unknown): input is TownSettings {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>;
  return Object.keys(value).every((key) => ["archiveAfterDays", "sound", "language", "saveConversation"].includes(key))
    && (value.saveConversation === undefined || typeof value.saveConversation === "boolean") && ["all", "follow", "off"].includes(value.sound as string)
    && ["auto", "ja", "en"].includes(value.language as string)
    && typeof value.archiveAfterDays === "number" && Number.isInteger(value.archiveAfterDays)
    && value.archiveAfterDays >= 0 && value.archiveAfterDays <= 365;
}

// Older files may omit sound and language.
export function storedSettings(input: unknown): TownSettings | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return;
  const value: Record<string, unknown> = { sound: "all", language: "auto", ...input };
  // Migrate the former on/off preference only when reading a saved file.
  if (value.sound === true) value.sound = "all";
  if (value.sound === false) value.sound = "off";
  return validSettings(value) ? value : undefined;
}

export const DAY_MS = 24 * 60 * 60 * 1000;

// Only the server calls this for a successfully created embedded terminal.
export function registerTown(towns: TownRecord[], name: string, path: string, now: number, key?: string, parent?: string): TownRecord[] {
  if (!name) throw new Error("Invalid town name");
  const existing = towns.find((town) => townKey(town) === (key ?? name))
    ?? towns.find((town) => !town.key && town.name === name);
  const identity = key ? { key, parent } : {};
  if (!existing) return [...towns, { name, path, ...identity, firstSeenAt: now, lastActiveAt: now, pinned: false }];
  return activateTown(towns.map((town) => town === existing ? { ...town, name, path, ...identity } : town), key ?? name, now);
}

// Events must first be associated with a terminal owned by this server.
export function activateTown(towns: TownRecord[], name: string, now: number): TownRecord[] {
  const next = towns.map((town) => {
    if (townKey(town) !== name || (town.lastActiveAt === now && town.archivedAt === undefined)) return town;
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
    && !activeNames.has(townKey(town)) && now - town.lastActiveAt > archiveAfterDays * DAY_MS
    ? { ...town, archivedAt: now } : town);
  return next.some((town, index) => town !== towns[index]) ? next : towns;
}
