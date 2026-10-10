import { JOB_NAMES, stats } from "../../core/story";
import type { TownHero } from "../../core/town";
import type { Theme } from "../town/ambient";
import { heroVariant } from "../town/appearance";
import type { Focus } from "../town/battle";
import type { Fight } from "../town/field";

export const SLOTS: [number, number][] = [[250, 210], [560, 190], [360, 430], [640, 440]];
const MONSTER_NAMES = { slime: "スライム", golem: "ゴーレム", ghost: "おばけ", dragon: "ドラゴン" };
const FX = { slime: 2, golem: 8, ghost: 6, dragon: 4 };

export function fights(heroes: TownHero[], now: number): Fight[] {
  return heroes.filter((hero) => hero.monster).slice(0, SLOTS.length).map((hero, i) => ({
    id: hero.id, x: SLOTS[i][0], y: SLOTS[i][1], name: hero.name, variant: heroVariant(hero.id),
    monster: `monster-${hero.monster}`, target: hero.agent.target ?? MONSTER_NAMES[hero.monster!],
    party: hero.party.map((job) => `party-${job}`), fx: FX[hero.monster!], level: stats(hero.agent, now).level,
    counter: hero.agent.failures.some((at) => now >= at && now - at < 2000),
  }));
}

export function focus(hero: TownHero, now: number): Focus {
  const values = stats(hero.agent, now);
  return { backdrop: `bg-battle-${hero.place}`, theme: hero.place as Theme, monster: `monster-${hero.monster}`,
    enemyFx: FX[hero.monster!], name: MONSTER_NAMES[hero.monster!], variant: heroVariant(hero.id),
    party: ["hero-back-battle", ...hero.party.slice(0, 4).map((job) => `party-${job}-back`)],
    status: [{ name: hero.name, ...values }, ...hero.party.slice(0, 4).map((job) => ({ name: JOB_NAMES[job] }))],
    message: `${hero.name}は ${MONSTER_NAMES[hero.monster!]}と たたかっている！\n${hero.agent.target ?? ""}`,
    counter: hero.agent.failures.some((at) => now >= at && now - at < 2000),
  };
}
