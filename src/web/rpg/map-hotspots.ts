import { tr } from "../language";
import type { TownTheme } from "../town/themes";
import type { HeroPlace, TownHero } from "../../core/town";
import { FIELD_EXITS } from "../town/field";
import { churchPriest, churchSlots } from "../town/church";
import { townSpots } from "../town/town";
import { innSlots } from "../town/inn";
import type { Sheets } from "../town/sheets";
import type { Walker } from "../town/walkers";
import { fights } from "./battles";
import { FIELD_NAMES } from "./navigation";

export function localHotspots(art: Sheets, place: HeroPlace, heroes: TownHero[], walkers: Walker[], gateMenu: boolean,
  go: (place: HeroPlace, focused?: string) => void,
  commands: (id: string, x: number, y: number, watch?: () => void) => void, openGate: () => void, priest: () => void, theme?: TownTheme) {
  if (place === "inn") {
    const room = art.entry("bg-inn").inn!, slots = innSlots(art), [dx, dy, w, h] = room.hit;
    const sleepers = heroes.filter((hero) => hero.place === "inn").slice(0, slots.length);
    return [...sleepers.map((hero, i) => ({ x: slots[i][0] + dx, y: slots[i][1] + dy, w, h, act: () => commands(hero.id, ...slots[i]) })),
      { ...room.exit, text: tr("▼ そとへ", "▼ Exit"), act: () => go("town") }];
  }
  if (place === "church") {
    const room = art.entry("bg-church").church!, slots = churchSlots(art), [dx, dy, w, h] = room.hit;
    const prayers = heroes.filter((hero) => hero.place === "church").slice(0, slots.length);
    return [{ ...churchPriest(art), act: priest }, ...prayers.map((hero, i) => {
      const [x, y] = slots[i];
      return { x: x + dx, y: y + dy, w, h, act: () => commands(hero.id, x, y) };
    }), { ...room.exit, text: tr("▼ そとへ", "▼ Exit"), act: () => go("town") }];
  }
  if (place === "town") {
    const spots = [
      { ...townSpots(art, theme).inn, act: () => go("inn"), text: undefined as string | undefined },
      { ...townSpots(art, theme).church, act: () => go("church"), text: undefined as string | undefined },
    ];
    for (const walker of walkers.filter((w) => heroes.some((h) => h.id === w.id))) {
      spots.push({ x: walker.x - 16, y: walker.y - 76, w: 32, h: 80, text: undefined, act: () => commands(walker.id, walker.x, walker.y) });
    }
    if (gateMenu) for (const [i, theme] of (["meadow", "cave", "forest"] as const).entries()) spots.push({
      x: 410, y: 404 + i * 20, w: 140, h: 18, text: `▶ ${FIELD_NAMES[theme]}`, act: () => go(theme),
    });
    else spots.push({ x: 430, y: 488, w: 100, h: 52, text: tr("▼ フィールドへ", "▼ To the field"), act: openGate });
    return spots;
  }
  const spots = FIELD_EXITS[place].map((exit) => ({ x: exit.x - 44, y: exit.y - 14, w: 88, h: 22, text: exit.text as string | undefined, act: () => go(exit.to) }));
  for (const fight of fights(art, heroes.filter((h) => h.place === place), Date.now())) spots.push({ x: fight.x - 22, y: fight.y - 60, w: 44, h: 66,
    text: undefined, act: () => commands(fight.id!, fight.x, fight.y, () => go(place, fight.id)) });
  return spots;
}
