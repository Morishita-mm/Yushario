import type { EquipmentTiers } from "../../core/battle-presentation";
import type { HeroPlace, TownHero } from "../../core/town";
import type { TownTheme } from "../../core/town-ledger";
import { heroVariant } from "../town/appearance";
import { drawChurch } from "../town/church";
import { drawField } from "../town/field";
import { drawInn } from "../town/inn";
import { drawLibrary } from "../town/library";
import { drawShop } from "../town/shop";
import type { NoticeMarkFrame } from "../town/notice-mark";
import type { Sheets } from "../town/sheets";
import { drawTown } from "../town/town";
import type { Walker } from "../town/walkers";
import { battleSlots, fights } from "./battles";
import { drawWorld, plate, type Project } from "../town/world";
import { tr } from "../language";

export function drawWorldScene(ctx: CanvasRenderingContext2D, art: Sheets, time: number, w: number, h: number, towns: Project[], archived: number) {
  const sleepingPlate = drawWorld(ctx, art, time, w, h, towns);
  const archivedPlate = archived ? plate(ctx, [[tr(`しまった町 ${archived}`, `ARCHIVED TOWNS ${archived}`), "#c9c3dc", 9]], 68, h - 24) : { x: -1, y: -1, w: 0, h: 0 };
  return { sleepingPlate, archivedPlate };
}

type LocalScene = {
  place: HeroPlace; time: number; now: number; heroes: TownHero[]; theme: TownTheme;
  name: string; walkers: Walker[]; notice?: NoticeMarkFrame; unstartedQuest?: boolean;
};

// Drawing data only; navigation, focus and agent state stay in Scene/Room.
export function drawLocalScene(ctx: CanvasRenderingContext2D, art: Sheets, scene: LocalScene,
  gear: (terminal?: string) => EquipmentTiers): void {
  const { place, time, now, heroes, theme, name, walkers, notice } = scene;
  if (place === "town") drawTown(ctx, art, time, {
    sleepers: heroes.filter((h) => h.place === "inn").length, prayers: heroes.filter((h) => h.place === "church").length,
    readers: heroes.filter((h) => h.place === "library").length, shoppers: heroes.filter((h) => h.place === "shop").length,
    theme, name, walkers, notice, unstartedQuest: scene.unstartedQuest,
  });
  else if (place === "inn") drawInn(ctx, art, time, heroes.filter((h) => h.place === "inn").map((h) => ({ id: h.id, name: h.name, branch: h.agent.branch, ...gear(h.agent.terminal) })), notice, name);
  else if (place === "church") drawChurch(ctx, art, time, heroes.filter((h) => h.place === "church").map((h) => ({ id: h.id, name: h.name, branch: h.agent.branch, variant: heroVariant(h.id), ...gear(h.agent.terminal) })), notice, name);
  else if (place === "library") drawLibrary(ctx, art, time, heroes.filter((h) => h.place === "library").map((h) => ({ id: h.id, name: h.name, branch: h.agent.branch, search: h.librarySearch, variant: heroVariant(h.id), ...gear(h.agent.terminal) })), notice, name);
  else if (place === "shop") drawShop(ctx, art, time, heroes.filter((h) => h.place === "shop").map((h) => ({ id: h.id, name: h.name, branch: h.agent.branch, variant: heroVariant(h.id), ...gear(h.agent.terminal) })), notice, name);
  else drawField(ctx, art, place, time, fights(art, heroes.filter((h) => h.place === place), now, gear), undefined,
    Math.max(0, heroes.filter((h) => h.place === place).length - battleSlots(art, place).length), notice, name);
}
