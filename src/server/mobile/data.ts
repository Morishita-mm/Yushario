import type { Room } from "../../core/room";
import type { QuestEvent } from "../../core/quests";
import type { HeroNames } from "../../core/names";
import { namedHero } from "../../core/names";
import { townNameForKey, type TownRecord } from "../../core/town-ledger";
import type { MobileHero, MobileReport } from "../../core/mobile-display";
import { mobileShort } from "./operations";

export function mobileHeroes(room: Room, names: HeroNames, towns: TownRecord[]): MobileHero[] {
  return [...room.agents.values()].filter(agent => agent.terminal).map(agent => {
    const lastReport = agent.talk.filter(entry => entry.from === "hero").at(-1)?.report;
    const state: MobileHero["state"] = agent.down?.active ? "error" : agent.activity === "ask" ? "waiting_input"
      : agent.activity === "think" ? "thinking" : agent.activity === "idle" || agent.activity === "rest"
        ? lastReport?.tests.last === "passed" ? "success" : "idle" : "working";
    return { id: agent.id, name: mobileShort(namedHero(names, agent.id) ?? agent.name, 200, "勇者"),
      town: mobileShort(agent.project ? townNameForKey(agent.project, towns) : "", 200, "町"), state, permissionPending: false };
  });
}
export function mobileReports(events: QuestEvent[], keepText: boolean): MobileReport[] {
  return events.map(event => ({ id: `report-${event.id}`, title: mobileShort(event.title, 200, "報告"),
    success: event.report?.stopFailure || event.report?.tests.last === "failed" ? false : event.report?.tests.last === "passed" ? true : null,
    at: event.at, excerpt: keepText ? mobileShort(event.text ?? "", 500) : "" }));
}
