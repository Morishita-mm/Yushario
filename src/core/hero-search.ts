import type { Activity } from "./activity";

// Finding a hero in the hero tab (docs/PLATFORM.md stage 25). One filter for the town view and the world map:
// inside a town the town is set (and can be cleared); on the world map it is not.
export type HeroState = "yours" | "working" | "resting";
export type HeroFilter = { town?: string; query: string; state: HeroState | "all" };
export type SearchableHero = { id: string; town: string; name: string; townName: string; branch?: string; activity: Activity; waiting: boolean };

export function heroState(hero: Pick<SearchableHero, "activity" | "waiting">): HeroState {
  if (hero.waiting || hero.activity === "ask") return "yours";
  return hero.activity === "idle" || hero.activity === "rest" ? "resting" : "working";
}
// Every word must appear in the hero's name, town name or branch (case-insensitive).
export function matchesQuery(hero: Pick<SearchableHero, "name" | "townName" | "branch">, query: string): boolean {
  const text = [hero.name, hero.townName, hero.branch ?? ""].join("\n").toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((word) => text.includes(word));
}
export function filterHeroes<T extends SearchableHero>(heroes: readonly T[], filter: HeroFilter): T[] {
  return heroes.filter((hero) => (filter.town === undefined || hero.town === filter.town) && matchesQuery(hero, filter.query)
    && (filter.state === "all" || heroState(hero) === filter.state));
}
// Counts for the state chips, after the town and words but before the state itself.
export function stateCounts(heroes: readonly SearchableHero[], filter: HeroFilter): Record<HeroState | "all", number> {
  const shown = filterHeroes(heroes, { ...filter, state: "all" });
  const counts = { all: shown.length, yours: 0, working: 0, resting: 0 };
  for (const hero of shown) counts[heroState(hero)]++;
  return counts;
}
