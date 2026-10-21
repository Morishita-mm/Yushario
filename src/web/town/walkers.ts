import { tr } from "../language";
import { relocateWalk, roadRoute, roadStep, walkTo } from "../../core/walking";
import { STATION_SLOTS, TOWN_WANDER_STOPS, type PropStation } from "../../core/town-station";
import { townLayout } from "./art-data";
import type { TownTheme } from "./themes";
import { label } from "./field";
import { weaponBesideLabel } from "./weapon";
import type { Sheets } from "./sheets";
import { drawNoticeHero, type NoticeMarkFrame } from "./notice-mark";

type StopPose = { pose: [string, string]; balloon?: string };
// Only neutral places are random stops. Activity props and the quest entrance are never destinations for idlers.
const STOP_POSES: Record<typeof TOWN_WANDER_STOPS[number], StopPose> = {
  plazaW: { pose: ["hero-model", "front"] }, plazaE: { pose: ["hero-model", "front"], balloon: "music note" },
  well: { pose: ["hero-model", "back"] }, bridge: { pose: ["hero-town", "look far"], balloon: "music note" },
  homeE: { pose: ["hero-model", "front"] },
};
const STOPS = TOWN_WANDER_STOPS.map((node) => ({ node, ...STOP_POSES[node] }));
const STATION_POSES: Record<PropStation, StopPose> = {
  fire: { pose: ["hero-model", "back"], balloon: "thinking dots" },
  crystal: { pose: ["hero-pray", "kneel facing up (back)"] },
  tower: { pose: ["hero-town", "look far"] },
};
export type Walker = {
  theme?: TownTheme;
  id: string; name: string; variant: number; x: number; y: number; at: string; stop: number; path: string[];
  waitUntil: number; walked: number; dx: number; dy: number; party: string[];
  station?: PropStation; stationSlot?: number; settling?: boolean;
  leaving?: boolean; wavedAt?: number; paused?: boolean; weaponTier?: number; branch?: string;
};
export type TownSign = { name: string; x: number; y: number; icon: string };

function route(art: Sheets, from: string, to: string, theme?: TownTheme): string[] {
  return roadRoute(townLayout(art.entry("bld-inn").town!, theme), from, to);
}

export function makeWalker(art: Sheets, id: string, name: string, variant: number, index: number, theme?: TownTheme): Walker {
  const stop = index % STOPS.length;
  const at = STOPS[stop].node;
  const [x, y] = townLayout(art.entry("bld-inn").town!, theme).nodes[at];
  return { id, name, variant, theme, x, y, at, stop, path: [], waitUntil: 0, walked: 0, dx: 0, dy: 1, party: [] };
}

export function changeWalkerTheme(art: Sheets, walker: Walker, theme?: TownTheme): void {
  if (walker.theme === theme) return;
  const town = art.entry("bld-inn").town!;
  Object.assign(walker, relocateWalk(townLayout(town, walker.theme), townLayout(town, theme), walker,
    walker.leaving ? "gate" : walker.station ?? STOPS[walker.stop].node));
  walker.theme = theme;
}

export function leave(art: Sheets, walker: Walker): void {
  const roads = townLayout(art.entry("bld-inn").town!, walker.theme);
  // Without a road to the gate the hero waves goodbye where it stands.
  Object.assign(walker, walkTo(roads, walker.x, walker.y, "gate") ?? { path: [] });
  walker.leaving = true; walker.station = undefined; walker.settling = false;
}

export function returnWalker(art: Sheets, walker: Walker, from = "gate"): void {
  const { nodes } = townLayout(art.entry("bld-inn").town!, walker.theme);
  walker.x = nodes[from][0]; walker.y = nodes[from][1]; walker.at = from;
  walker.path = route(art, from, walker.station ?? STOPS[walker.stop].node, walker.theme); walker.dy = -1;
}

export function setWalkerStation(art: Sheets, walker: Walker, station: PropStation | undefined, neighbours: Walker[]): void {
  if (walker.station === station || walker.leaving) return;
  const roads = townLayout(art.entry("bld-inn").town!, walker.theme);
  if (station) {
    const taken = new Set(neighbours.filter((w) => w !== walker && w.station === station).map((w) => w.stationSlot));
    const slots = STATION_SLOTS[station], [x, y] = roads.nodes[station];
    // Keep existing slots stable. Overflow shares the nearest slot, never expands into scenery.
    walker.stationSlot = slots.findIndex((_, i) => !taken.has(i));
    if (walker.stationSlot < 0) walker.stationSlot = slots.map(([dx, dy], i) => ({ i, distance: Math.hypot(x + dx - walker.x, y + dy - walker.y) }))
      .sort((a, b) => a.distance - b.distance)[0].i;
  } else walker.stationSlot = undefined;
  walker.station = station; walker.settling = false; walker.waitUntil = 0;
  Object.assign(walker, walkTo(roads, walker.x, walker.y, station ?? STOPS[walker.stop].node));
}

export function stepWalkers(art: Sheets, walkers: Walker[], t: number, dt: number): Walker[] {
  const departed: Walker[] = [];
  for (const walker of walkers) {
    if (walker.paused) continue;
    if (walker.leaving && !walker.path.length) {
      walker.wavedAt ??= t;
      if (t - walker.wavedAt > 1600) departed.push(walker);
      continue;
    }
    const roads = townLayout(art.entry("bld-inn").town!, walker.theme);
    if (!walker.path.length && walker.station) {
      const [x, y] = roads.nodes[walker.station], [dx, dy] = STATION_SLOTS[walker.station][walker.stationSlot ?? 0];
      const step = roadStep(walker.x, walker.y, [x + dx, y + dy], dt);
      walker.x = step.x; walker.y = step.y; walker.walked += step.move; walker.settling = !step.arrived;
      if (step.move > 0) { walker.dx = step.dx; walker.dy = step.dy; }
      continue;
    }
    if (!walker.path.length) {
      if (!walker.waitUntil) walker.waitUntil = t + 3000 + Math.random() * 5000;
      if (t < walker.waitUntil) continue;
      const taken = new Set(walkers.filter((w) => !w.station).map((w) => w.stop));
      const free = STOPS.map((_, i) => i).filter((i) => !taken.has(i));
      walker.stop = free[Math.floor(Math.random() * free.length)] ?? (walker.stop + 1) % STOPS.length;
      walker.path = route(art, walker.at, STOPS[walker.stop].node, walker.theme);
      walker.waitUntil = 0;
      continue;
    }
    const target = roads.nodes[walker.path[0]];
    const step = roadStep(walker.x, walker.y, target, dt);
    walker.x = step.x; walker.y = step.y;
    if (step.move > 0) { walker.dx = step.dx; walker.dy = step.dy; }
    walker.walked += step.move;
    if (step.arrived) walker.at = walker.path.shift()!;
  }
  for (const walker of departed) walkers.splice(walkers.indexOf(walker), 1);
  return departed;
}

export function drawWalker(ctx: CanvasRenderingContext2D, art: Sheets, walker: Walker, t: number, notice?: NoticeMarkFrame): void {
  const mark = notice?.id === walker.id ? notice : undefined;
  const stride = Math.floor(walker.walked / 7) % 4, moving = walker.path.length > 0 || walker.settling;
  walker.party.forEach((id, i) => art.draw(ctx, id, moving ? art.pose(id, "follow", stride % 2) : "front", walker.x - 22 - i * 18, walker.y + 12 + i * 12));
  if (walker.leaving && !walker.path.length) {
    const age = t - (walker.wavedAt ?? t);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - 1000) / 600);
    art.draw(ctx, art.variant(Math.floor(age / 250) % 2 ? "hero-town" : "hero-model", walker.variant), Math.floor(age / 250) % 2 ? "call" : "front", walker.x, walker.y);
    label(ctx, tr("またね！", "See you!"), walker.x, walker.y - 62, "#ffe066", 11);
    weaponBesideLabel(ctx, art, walker.weaponTier, t, tr("またね！", "See you!"), walker.x, walker.y - 62);
    ctx.globalAlpha = 1;
    return;
  }
  if (walker.paused) {
    drawNoticeHero(ctx, art, art.variant("hero-model", walker.variant), "front", walker.x, walker.y, mark);
  } else if (!moving) {
    const stop = walker.station ? STATION_POSES[walker.station] : STOPS[walker.stop];
    const [sheet, frame] = stop.pose;
    drawNoticeHero(ctx, art, art.variant(sheet, walker.variant), frame, walker.x, walker.y - (Math.floor((t + walker.variant * 300) / 700) % 2), mark);
    if (stop.balloon !== undefined && Math.floor((t + walker.variant * 900) / 2500) % 3 === 0) art.draw(ctx, "ui-balloons", stop.balloon, walker.x, walker.y - 60);
  } else if (Math.abs(walker.dx) > Math.abs(walker.dy)) {
    drawNoticeHero(ctx, art, art.variant("hero-walk", walker.variant), art.pose("hero-walk", "right", stride), walker.x, walker.y, mark, walker.dx < 0);
  } else {
    const id = walker.dy > 0 ? "hero-walk" : "hero-walk-back";
    drawNoticeHero(ctx, art, art.variant(id, walker.variant), art.pose(id, walker.dy > 0 ? "front" : "back", stride), walker.x, walker.y, mark);
  }
  label(ctx, walker.name, walker.x, walker.y + 13);
  if (walker.branch) label(ctx, walker.branch, walker.x, walker.y + 25, "#9fd3ff", 8, "branch");
  weaponBesideLabel(ctx, art, walker.weaponTier, t, walker.name, walker.x, walker.y + 13);
}
