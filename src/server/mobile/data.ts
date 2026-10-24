import type { Room } from "../../core/room";
import type { HeroNames } from "../../core/names";
import type { TownNames } from "../../core/town";
import { namedHero } from "../../core/names";
import { townKey, townLabel, type TownRecord } from "../../core/town-ledger";
import type { MobileHero } from "../../core/mobile-display";
import { mobileShort } from "./operations";
import type { MobileQuests } from "./quests";

export function mobileHeroes(room: Room, names: HeroNames, towns: TownRecord[], quests: MobileQuests, history: TownNames = []): MobileHero[] {
  return [...room.agents.values()].filter(agent => agent.terminal).map(agent => {
    const town = towns.find(town => townKey(town) === agent.project);
    const lastReport = agent.talk.filter(entry => entry.from === "hero").at(-1)?.report;
    const state: MobileHero["state"] = agent.down?.active ? "error" : agent.activity === "ask" ? "waiting_input"
      : agent.activity === "think" ? "thinking" : agent.activity === "idle" || agent.activity === "rest"
        ? lastReport?.tests.last === "passed" ? "success" : "idle" : "working";
    return { id: agent.id, name: mobileShort(namedHero(names, agent.id) ?? history.find(entry => entry.id === agent.id)?.name ?? agent.name, 200, "勇者"),
      town: mobileShort(town ? townLabel(town, towns) : "", 200, "町"), townId: quests.townId(agent.project), state, permissionPending: false };
  });
}
