import { basename, dirname } from "node:path";
import type { Room } from "../../core/room";
import type { HeroNames } from "../../core/names";
import { townView, type TownNames } from "../../core/town";
import { mobileHeroName, namedHero } from "../../core/names";
import { heroVariant } from "../../core/mobile-hero";
import { AGENTS } from "../agents";
import type { TerminalSession } from "../pty-session";
import { townKey, townLabel, type TownRecord } from "../../core/town-ledger";
import type { MobileHero } from "../../core/mobile-display";
import { mobileShort } from "./operations";
import type { MobileQuests } from "./quests";

export function mobileHeroes(room: Room, names: HeroNames, towns: TownRecord[], quests: MobileQuests, history: TownNames = [],
  sessions: readonly Pick<TerminalSession, "id" | "preset">[] = []): MobileHero[] {
  const assigned = townView(room, 0, history).names;
  return [...room.agents.values()].map(agent => {
    const town = towns.find(town => townKey(town) === agent.project);
    const lastReport = agent.talk.filter(entry => entry.from === "hero").at(-1)?.report;
    const state: MobileHero["state"] = agent.down?.active ? "error" : agent.activity === "ask" ? "waiting_input"
      : agent.activity === "think" ? "thinking" : agent.activity === "idle" || agent.activity === "rest"
        ? lastReport?.tests.last === "passed" ? "success" : "idle" : "working";
    const preset = sessions.find(session => session.id === agent.terminal)?.preset;
    // path tracks the last launched cwd and may be another worktree, not the town folder.
    const folder = town?.key ? basename(town.key) === ".git" ? dirname(town.key) : town.key : town?.path;
    const labels = town ? [town.name, townLabel(town, towns), folder ? basename(folder) : ""] : [];
    const name = mobileHeroName(namedHero(names, agent.id), assigned.find(entry => entry.id === agent.id)!, labels, preset ? AGENTS[preset].label : undefined);
    return { id: agent.id, name: mobileShort(name, 200, "勇者"), variant: heroVariant(agent.id),
      town: mobileShort(town ? townLabel(town, towns) : "", 200, "町"), townId: quests.townId(agent.project), state, permissionPending: false };
  });
}
