import type { TownHero } from "../../core/town";
import type { TownRecord, TownTheme } from "../../core/town-ledger";
import type { Project } from "../town/world";
import { unreadReports } from "./read-reports";

// Ledger towns and visiting heroes share the world map; external towns are not saved.
export function townProjects(records: TownRecord[], heroes: TownHero[], look: (name: string) => TownTheme | undefined): Map<string, Project> {
  const towns = new Map<string, Project>();
  for (const town of records.filter((record) => record.archivedAt === undefined)) {
    towns.set(town.name, { repo: town.name, theme: town.theme, heroes: 0, fighting: 0, unread: 0, calling: false, pinned: town.pinned });
  }
  for (const hero of heroes) {
    if (!towns.has(hero.project) && !hero.agent.terminal) {
      towns.set(hero.project, { repo: hero.project, theme: look(hero.project), heroes: 0, fighting: 0, unread: 0, calling: false });
    }
  }
  for (const hero of heroes) {
    const town = towns.get(hero.project);
    if (town) {
      town.heroes++; if (hero.monster) town.fighting++;
      town.unread += unreadReports(hero.agent).length;
      town.calling ||= hero.agent.activity === "ask";
    }
  }
  return towns;
}
