import type { HeroPlace, TownHero } from "../../core/town";
import { FIELD_EXITS } from "../town/field";
import { CHURCH_PRIEST, CHURCH_SLOTS } from "../town/church";
import { TOWN_SPOTS } from "../town/town";
import type { Walker } from "../town/walkers";
import { fights } from "./battles";
import { FIELD_NAMES } from "./navigation";

export function localHotspots(place: HeroPlace, heroes: TownHero[], walkers: Walker[], gateMenu: boolean,
  go: (place: HeroPlace, focused?: string) => void,
  commands: (id: string, x: number, y: number, watch?: () => void) => void, openGate: () => void, priest: () => void) {
  if (place === "inn") {
    const sleepers = heroes.filter((hero) => hero.place === "inn").slice(0, 6);
    return [...sleepers.map((hero, i) => ({ x: 200 + i * 112 - 32, y: 290, w: 64, h: 90, act: () => commands(hero.id, 200 + i * 112, 360) })),
      { x: 430, y: 500, w: 100, h: 34, text: "▼ そとへ", act: () => go("town") }];
  }
  if (place === "church") {
    const prayers = heroes.filter((hero) => hero.place === "church").slice(0, CHURCH_SLOTS.length);
    return [{ ...CHURCH_PRIEST, act: priest }, ...prayers.map((hero, i) => {
      const [x, y] = CHURCH_SLOTS[i];
      return { x: x - 24, y: y - 55, w: 48, h: 70, act: () => commands(hero.id, x, y) };
    }), { x: 430, y: 500, w: 100, h: 34, text: "▼ そとへ", act: () => go("town") }];
  }
  if (place === "town") {
    const spots = [
      { ...TOWN_SPOTS.inn, act: () => go("inn"), text: undefined as string | undefined },
      { ...TOWN_SPOTS.church, act: () => go("church"), text: undefined as string | undefined },
    ];
    for (const walker of walkers.filter((w) => heroes.some((h) => h.id === w.id))) {
      spots.push({ x: walker.x - 16, y: walker.y - 76, w: 32, h: 80, text: undefined, act: () => commands(walker.id, walker.x, walker.y) });
    }
    if (gateMenu) for (const [i, theme] of (["meadow", "cave", "forest"] as const).entries()) spots.push({
      x: 410, y: 404 + i * 20, w: 140, h: 18, text: `▶ ${FIELD_NAMES[theme]}`, act: () => go(theme),
    });
    else spots.push({ x: 430, y: 488, w: 100, h: 52, text: "▼ フィールドへ", act: openGate });
    return spots;
  }
  const spots = FIELD_EXITS[place].map((exit) => ({ x: exit.x - 44, y: exit.y - 14, w: 88, h: 22, text: exit.text as string | undefined, act: () => go(exit.to) }));
  for (const fight of fights(heroes.filter((h) => h.place === place), Date.now())) spots.push({ x: fight.x - 22, y: fight.y - 60, w: 44, h: 66,
    text: undefined, act: () => commands(fight.id!, fight.x, fight.y, () => go(place, fight.id)) });
  return spots;
}
