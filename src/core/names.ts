import { isClaudeSessionId } from "./roster";

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
