import { moods, type Room, type RoomAgent } from "./room";
import { stationActivity, townStation, type PropStation } from "./town-station";
import { battleMonster, jobOf, type Job, type MonsterKind } from "./story";

export type HeroPlace = "town" | "inn" | "church" | "library" | "shop" | "meadow" | "cave" | "forest";
export type TownHero = {
  id: string;
  name: string;
  project: string; // Town key, not a display name.
  place: HeroPlace;
  station?: PropStation;
  librarySearch?: boolean;
  monster?: MonsterKind;
  party: Job[];
  agent: RoomAgent;
};
type TownProject = { name: string; heroes: TownHero[] }; // name is the town key.
export type TownNames = { id: string; project: string; base: string; name: string }[];

export function townView(room: Room, now: number, previous: TownNames = []): {
  projects: TownProject[]; names: TownNames;
} {
  const names = [...previous];
  const projects = new Map<string, TownProject>();
  for (const agent of room.agents.values()) {
    const project = agent.project ?? agent.name;
    let assigned = names.find((entry) => entry.id === agent.id);
    if (!assigned) {
      // Keep departed heroes in the history so their numbers are never reused.
      const number = names.filter((entry) => entry.project === project && entry.base === agent.name).length + 1;
      assigned = {
        id: agent.id, project, base: agent.name,
        name: number === 1 ? agent.name : `${agent.name} (${number})`,
      };
      names.push(assigned);
    }
    let town = projects.get(project);
    if (!town) {
      town = { name: project, heroes: [] };
      projects.set(project, town);
    }
    const monster = battleMonster(agent.activity), station = townStation(agent, now);
    const place: HeroPlace = monster
      ? monster === "golem" ? "cave" : monster === "ghost" ? "forest" : "meadow"
      : agent.activity === "rest" ? "church" : moods(agent, now).includes("dozing") ? "inn"
        : station === "library" || station === "shop" ? station : "town";
    town.heroes.push({
      id: agent.id, name: assigned.name, project, place,
      station: place === "town" && station !== "library" && station !== "shop" ? station : undefined,
      librarySearch: place === "library" && stationActivity(agent, now) === "search",
      ...(monster ? { monster } : {}),
      party: agent.helpers.map((helper) => jobOf(helper.type)), agent,
    });
  }
  return { projects: [...projects.values()], names };
}
