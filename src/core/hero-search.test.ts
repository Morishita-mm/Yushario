import { describe, expect, it } from "vitest";
import { filterHeroes, heroState, matchesQuery, stateCounts, type SearchableHero } from "./hero-search";

const hero = (id: string, town: string, extra: Partial<SearchableHero> = {}): SearchableHero =>
  ({ id, town, name: id, townName: town === "/a" ? "agent-character" : "blog", activity: "idle", waiting: false, ...extra });
const heroes = [
  hero("main-2", "/a", { branch: "main" }),
  hero("Mina", "/a", { activity: "edit", branch: "fix-login" }),
  hero("riku", "/b", { activity: "ask" }),
  hero("sora", "/b", { waiting: true, activity: "test" }),
];

describe("hero search", () => {
  it("sorts heroes into your turn, working and resting", () => {
    expect(heroes.map(heroState)).toEqual(["resting", "working", "yours", "yours"]);
    expect(heroState({ activity: "rest", waiting: false })).toBe("resting");
  });
  it("matches every word against the name, town name or branch, ignoring case", () => {
    expect(matchesQuery(heroes[1], "mina")).toBe(true);
    expect(matchesQuery(heroes[1], "agent fix")).toBe(true);
    expect(matchesQuery(heroes[1], "agent blog")).toBe(false);
    expect(matchesQuery(heroes[0], "  ")).toBe(true);
  });
  it("keeps to the town inside a town, and searches every town on the world map", () => {
    expect(filterHeroes(heroes, { town: "/a", query: "", state: "all" }).map((item) => item.id)).toEqual(["main-2", "Mina"]);
    expect(filterHeroes(heroes, { query: "blog", state: "all" }).map((item) => item.id)).toEqual(["riku", "sora"]);
    expect(filterHeroes(heroes, { town: "/a", query: "blog", state: "all" })).toEqual([]);
  });
  it("filters by state and counts the chips before the state is applied", () => {
    expect(filterHeroes(heroes, { query: "", state: "yours" }).map((item) => item.id)).toEqual(["riku", "sora"]);
    expect(stateCounts(heroes, { town: "/a", query: "", state: "yours" })).toEqual({ all: 2, yours: 0, working: 1, resting: 1 });
  });
});
