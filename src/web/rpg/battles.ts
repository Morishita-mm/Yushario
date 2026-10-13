import { JOB_NAMES, stats } from "../../core/story";
import { recentBattleSuccess, type EquipmentTiers } from "../../core/battle-presentation";
import type { TownHero } from "../../core/town";
import type { Theme } from "../town/ambient";
import { heroVariant } from "../town/appearance";
import type { Focus } from "../town/battle";
import type { Fight } from "../town/field";

import type { Sheets } from "../town/sheets";

export const battleSlots = (art: Sheets, theme: Theme) => art.entry(`bg-field-${theme}`).field!.fights;
const MONSTER_NAMES = { slime: "スライム", golem: "ゴーレム", ghost: "おばけ", dragon: "ドラゴン" };
const FX = { slime: "claw", golem: "rocks", ghost: "curse", dragon: "fire" };

export function fights(art: Sheets, heroes: TownHero[], now: number, gear: (terminal?: string) => EquipmentTiers = () => ({})): Fight[] {
  const slots = battleSlots(art, (heroes.find((hero) => hero.monster)?.place ?? "meadow") as Theme);
  return heroes.filter((hero) => hero.monster).slice(0, slots.length).map((hero, i) => ({
    id: hero.id, x: slots[i][0], y: slots[i][1], name: hero.name, variant: heroVariant(hero.id),
    monster: `monster-${hero.monster}`, target: hero.agent.target ?? MONSTER_NAMES[hero.monster!],
    party: hero.party.map((job) => `party-${job}`), fx: FX[hero.monster!], level: stats(hero.agent, now).level,
    counter: hero.agent.failures.some((at) => now >= at && now - at < 2000),
    ...gear(hero.agent.terminal), success: recentBattleSuccess(hero.agent, now),
  }));
}

export function focus(hero: TownHero, now: number, gear: EquipmentTiers = {}): Focus {
  const values = stats(hero.agent, now);
  return { backdrop: `bg-battle-${hero.place}`, theme: hero.place as Theme, monster: `monster-${hero.monster}`,
    enemyFx: FX[hero.monster!], name: MONSTER_NAMES[hero.monster!], variant: heroVariant(hero.id),
    party: ["hero-back-battle", ...hero.party.slice(0, 4).map((job) => `party-${job}-back`)],
    status: [{ name: hero.name, ...values }, ...hero.party.slice(0, 4).map((job) => ({ name: JOB_NAMES[job] }))],
    message: `${hero.name}は ${MONSTER_NAMES[hero.monster!]}と たたかっている！\n${hero.agent.target ?? ""}`,
    counter: hero.agent.failures.some((at) => now >= at && now - at < 2000),
    ...gear, success: recentBattleSuccess(hero.agent, now),
  };
}
