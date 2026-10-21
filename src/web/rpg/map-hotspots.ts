import { tr } from "../language";
import { questBoardHotspot } from "../town/quest-board";
import { LIBRARY_SCALE, libraryPositions, librarianBox } from "../town/library";
import { SHOP_SCALE, shopSlots, shopkeeperBox } from "../town/shop";
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
import { markers, type Project } from "../town/world";

type Plate = { x: number; y: number; w: number; h: number };
export function worldHotspots(art: Sheets, w: number, h: number, towns: Project[], sleeping: Plate, archived: Plate,
  openList: (kind: "sleeping" | "archived" | TownTheme) => void, enter: (town: Project) => void) {
  return [...markers(art, w, h, towns).map((marker) => ({ x: marker.x - 34, y: marker.y - 22, w: 68, h: 60, act: () => {
    if (marker.projects.length > 1) openList(marker.theme);
    else enter(marker.projects[0]);
  } })), { ...sleeping, act: () => openList("sleeping") }, { ...archived, act: () => openList("archived") }];
}

export function localHotspots(art: Sheets, place: HeroPlace, heroes: TownHero[], walkers: Walker[], gateMenu: boolean,
  go: (place: HeroPlace, focused?: string) => void,
  commands: (id: string, x: number, y: number, watch?: () => void) => void, openGate: () => void, talk: (who: "priest" | "shopkeeper" | "librarian") => void, theme?: TownTheme, board: () => void = () => undefined) {
  if (place === "inn") {
    const room = art.entry("bg-inn").inn!, slots = innSlots(art), [dx, dy, w, h] = room.hit;
    const sleepers = heroes.filter((hero) => hero.place === "inn").slice(0, slots.length);
    return [...sleepers.map((hero, i) => ({ x: slots[i][0] + dx, y: slots[i][1] + dy, w, h, act: () => commands(hero.id, ...slots[i]) })),
      { ...room.exit, text: tr("▼ そとへ", "▼ Exit"), act: () => go("town") }];
  }
  if (place === "church") {
    const room = art.entry("bg-church").church!, slots = churchSlots(art), [dx, dy, w, h] = room.hit;
    const prayers = heroes.filter((hero) => hero.place === "church").slice(0, slots.length);
    return [{ ...churchPriest(art), act: () => talk("priest") }, ...prayers.map((hero, i) => {
      const [x, y] = slots[i];
      return { x: x + dx, y: y + dy, w, h, act: () => commands(hero.id, x, y) };
    }), { ...room.exit, text: tr("▼ そとへ", "▼ Exit"), act: () => go("town") }];
  }
  if (place === "library" || place === "shop") {
    const visitors = heroes.filter((hero) => hero.place === place);
    const room = place === "library" ? art.entry("bg-library").library! : art.entry("bg-shop").shop!;
    const positions = place === "library" ? libraryPositions(art, visitors.map((hero) => Boolean(hero.librarySearch))) : shopSlots(art);
    const k = place === "shop" ? SHOP_SCALE : LIBRARY_SCALE, [dx, dy, w, h] = room.hit.map((n) => n * k);
    const npc = place === "shop" ? { ...shopkeeperBox(art), act: () => talk("shopkeeper") } : { ...librarianBox(art), act: () => talk("librarian") };
    return [npc, ...visitors.flatMap((hero, i) => {
      const point = positions[i];
      return point ? [{ x: point[0] + dx, y: point[1] + dy, w, h, act: () => commands(hero.id, ...point) }] : [];
    }), { ...room.exit, text: tr("▼ そとへ", "▼ Exit"), act: () => go("town") }];
  }
  if (place === "town") {
    const spots = [questBoardHotspot(art, theme, board),
      { ...townSpots(art, theme).inn, act: () => go("inn"), text: undefined as string | undefined },
      { ...townSpots(art, theme).church, act: () => go("church"), text: undefined as string | undefined },
      { ...townSpots(art, theme).library, act: () => go("library"), text: undefined as string | undefined },
      { ...townSpots(art, theme).shop, act: () => go("shop"), text: undefined as string | undefined },
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
