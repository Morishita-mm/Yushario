// Shared with the PC town art. Use the internal room hero ID, never a gateway-issued ID.
export type HeroVariant = 0 | 1 | 2 | 3 | 4;
export function heroVariant(id: string): HeroVariant {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (hash % 5) as HeroVariant;
}
export function isHeroVariant(value: unknown): value is HeroVariant {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4;
}
