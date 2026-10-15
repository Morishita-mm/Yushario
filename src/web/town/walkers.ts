import { tr } from "../language";
import { relocateWalk, roadRoute, roadStep, walkTo } from "../../core/walking";
import { townLayout } from "./art-data";
import type { TownTheme } from "./themes";
import { label } from "./field";
import { weaponBesideLabel } from "./weapon";
import type { Sheets } from "./sheets";
import { drawNoticeHero, type NoticeMarkFrame } from "./notice-mark";

// Street graph coordinates/edges come from the same data that places the buildings.
const STOPS: { node: string; pose: [string, string]; balloon?: string }[] = [
  { node: "plazaW", pose: ["hero-model", "front"], balloon: "thinking dots" }, { node: "plazaE", pose: ["hero-model", "front"], balloon: "music note" },
  { node: "board", pose: ["hero-model", "back"] }, { node: "shop", pose: ["hero-model", "back"] },
  { node: "well", pose: ["hero-model", "back"] }, { node: "bridge", pose: ["hero-town", "look far"], balloon: "music note" },
  { node: "fire", pose: ["hero-model", "back"], balloon: "heart" }, { node: "crystal", pose: ["hero-pray", "kneel facing up (back)"] },
  { node: "library", pose: ["hero-town", "read"] }, { node: "homeE", pose: ["hero-model", "front"] },
];
export type Walker = {
  theme?: TownTheme;
  id: string; name: string; variant: number; x: number; y: number; at: string; stop: number; path: string[];
  waitUntil: number; walked: number; dx: number; dy: number; party: string[];
  leaving?: boolean; wavedAt?: number; paused?: boolean; weaponTier?: number; branch?: string;
};
export type TownSign = { name: string; x: number; y: number; icon: string };
export type Departed = { name: string; repo: string; left: string; last: string };

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
    walker.leaving ? "gate" : STOPS[walker.stop].node));
  walker.theme = theme;
}

export function leave(art: Sheets, walker: Walker): void {
  const roads = townLayout(art.entry("bld-inn").town!, walker.theme);
  // Without a road to the gate the hero waves goodbye where it stands.
  Object.assign(walker, walkTo(roads, walker.x, walker.y, "gate") ?? { path: [] });
  walker.leaving = true;
}

export function returnWalker(art: Sheets, walker: Walker): void {
  const { nodes } = townLayout(art.entry("bld-inn").town!, walker.theme);
  walker.x = nodes.gate[0]; walker.y = nodes.gate[1]; walker.at = "gate";
  walker.path = route(art, "gate", STOPS[walker.stop].node, walker.theme); walker.dy = -1;
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
    if (!walker.path.length) {
      if (!walker.waitUntil) walker.waitUntil = t + 3000 + Math.random() * 5000;
      if (t < walker.waitUntil) continue;
      const taken = new Set(walkers.map((w) => w.stop));
      const free = STOPS.map((_, i) => i).filter((i) => !taken.has(i));
      walker.stop = free[Math.floor(Math.random() * free.length)] ?? (walker.stop + 1) % STOPS.length;
      walker.path = route(art, walker.at, STOPS[walker.stop].node, walker.theme);
      walker.waitUntil = 0;
      continue;
    }
    const target = townLayout(art.entry("bld-inn").town!, walker.theme).nodes[walker.path[0]];
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
  const stride = Math.floor(walker.walked / 7) % 4;
  walker.party.forEach((id, i) => art.draw(ctx, id, walker.path.length ? art.pose(id, "follow", stride % 2) : "front", walker.x - 22 - i * 18, walker.y + 12 + i * 12));
  if (walker.leaving && !walker.path.length) {
    const age = t - (walker.wavedAt ?? t);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - 1000) / 600);
    art.draw(ctx, art.variant(Math.floor(age / 250) % 2 ? "hero-town" : "hero-model", walker.variant), Math.floor(age / 250) % 2 ? "call" : "front", walker.x, walker.y);
    label(ctx, tr("またね！", "Farewell!"), walker.x, walker.y - 62, "#ffe066", 11);
    weaponBesideLabel(ctx, art, walker.weaponTier, t, tr("またね！", "Farewell!"), walker.x, walker.y - 62);
    ctx.globalAlpha = 1;
    return;
  }
  if (walker.paused) {
    drawNoticeHero(ctx, art, art.variant("hero-model", walker.variant), "front", walker.x, walker.y, mark);
  } else if (!walker.path.length) {
    const stop = STOPS[walker.stop];
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
