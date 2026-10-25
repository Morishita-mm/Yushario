import { isClaudeSessionId } from "./roster";
import type { TownNames } from "./town";

export type HeroNames = Record<string, string>;

// Empty after trimming means remove the override, not an invalid name.
export function normalizeHeroName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const name = value.trim();
  return name.length <= 24 ? name : undefined;
}

export function validHeroNames(input: unknown): input is HeroNames {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  return Object.entries(input).every(([id, name]) => isClaudeSessionId(id)
    && typeof name === "string" && name.length > 0 && normalizeHeroName(name) === name);
}

export function namedHero(names: Readonly<HeroNames>, id: string): string | undefined {
  return Object.hasOwn(names, id) ? names[id] : undefined;
}

// Only a town-like automatic base is replaced. Keep TownNames' lifetime numbering,
// including departed heroes, rather than renumbering the currently visible list.
export function mobileHeroName(custom: string | undefined, assigned: Pick<TownNames[number], "base" | "name">,
  townLabels: readonly string[], presetLabel?: string): string {
  if (custom !== undefined) return custom;
  if (!townLabels.includes(assigned.base)) return assigned.name;
  const suffix = assigned.name.slice(assigned.base.length);
  const number = /^ \(([1-9][0-9]*)\)$/.exec(suffix)?.[1] ?? "1";
  return `${presetLabel ?? "勇者"} ${number}`;
}
