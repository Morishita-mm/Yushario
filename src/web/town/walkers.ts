import { label } from "./field";
import type { Sheets } from "./sheets";

// Street graph coordinates/edges come from the same data that places the buildings.
const STOPS: { node: string; pose: [string, string]; balloon?: string }[] = [
  { node: "plazaW", pose: ["hero-model", "front"], balloon: "thinking dots" }, { node: "plazaE", pose: ["hero-model", "front"], balloon: "music note" },
  { node: "board", pose: ["hero-model", "back"] }, { node: "shop", pose: ["hero-model", "back"] },
  { node: "well", pose: ["hero-model", "back"] }, { node: "bridge", pose: ["hero-town", "look far"], balloon: "music note" },
  { node: "fire", pose: ["hero-model", "front"], balloon: "heart" }, { node: "crystal", pose: ["hero-town", "pray"] },
  { node: "library", pose: ["hero-town", "read"] }, { node: "homeE", pose: ["hero-model", "front"] },
];
export type Walker = {
  id: string; name: string; variant: number; x: number; y: number; at: string; stop: number; path: string[];
  waitUntil: number; walked: number; dx: number; dy: number; party: string[];
  leaving?: boolean; wavedAt?: number; paused?: boolean;
};
export type TownSign = { name: string; x: number; y: number; icon: string };
export type Departed = { name: string; repo: string; left: string; last: string };

function route(art: Sheets, from: string, to: string): string[] {
  const { edges } = art.entry("bld-inn").town!;
  const previous = new Map<string, string>([[from, ""]]);
  const queue = [from];
  while (queue.length) {
    const node = queue.shift()!;
    if (node === to) break;
    for (const [a, b] of edges) {
      const next = a === node ? b : b === node ? a : undefined;
      if (next && !previous.has(next)) { previous.set(next, node); queue.push(next); }
    }
  }
  const path: string[] = [];
  for (let node = to; node && node !== from; node = previous.get(node)!) path.unshift(node);
  return path;
}

export function makeWalker(art: Sheets, id: string, name: string, variant: number, index: number): Walker {
  const stop = index % STOPS.length;
  const at = STOPS[stop].node;
  const [x, y] = art.entry("bld-inn").town!.nodes[at];
  return { id, name, variant, x, y, at, stop, path: [], waitUntil: 0, walked: 0, dx: 0, dy: 1, party: [] };
}

export function leave(art: Sheets, walker: Walker): void {
  const { nodes } = art.entry("bld-inn").town!;
  walker.at = Object.entries(nodes).sort(([, a], [, b]) => Math.hypot(a[0] - walker.x, a[1] - walker.y) - Math.hypot(b[0] - walker.x, b[1] - walker.y))[0][0];
  walker.leaving = true;
  walker.path = route(art, walker.at, "gate");
  if (Math.hypot(nodes[walker.at][0] - walker.x, nodes[walker.at][1] - walker.y) > 1) walker.path.unshift(walker.at);
}

export function returnWalker(art: Sheets, walker: Walker): void {
  const { nodes } = art.entry("bld-inn").town!;
  walker.x = nodes.gate[0]; walker.y = nodes.gate[1] + 20; walker.at = "gate";
  walker.path = route(art, "gate", STOPS[walker.stop].node); walker.dy = -1;
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
      walker.path = route(art, walker.at, STOPS[walker.stop].node);
      walker.waitUntil = 0;
      continue;
    }
    const [tx, ty] = art.entry("bld-inn").town!.nodes[walker.path[0]];
    const dx = tx - walker.x, dy = ty - walker.y;
    const distance = Math.hypot(dx, dy);
    const move = Math.min(distance, 36 * dt / 1000);
    if (distance > 0) {
      walker.x += dx / distance * move; walker.y += dy / distance * move;
      walker.dx = dx; walker.dy = dy;
    }
    walker.walked += move;
    if (distance - move < 0.5) walker.at = walker.path.shift()!;
  }
  for (const walker of departed) walkers.splice(walkers.indexOf(walker), 1);
  return departed;
}

export function drawWalker(ctx: CanvasRenderingContext2D, art: Sheets, walker: Walker, t: number): void {
  const stride = Math.floor(walker.walked / 7) % 4;
  walker.party.forEach((id, i) => art.draw(ctx, id, walker.path.length ? art.pose(id, "follow", stride % 2) : "front", walker.x - 22 - i * 18, walker.y + 12 + i * 12));
  if (walker.leaving && !walker.path.length) {
    const age = t - (walker.wavedAt ?? t);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - 1000) / 600);
    art.draw(ctx, art.variant(Math.floor(age / 250) % 2 ? "hero-town" : "hero-model", walker.variant), Math.floor(age / 250) % 2 ? "call" : "front", walker.x, walker.y);
    label(ctx, "またね！", walker.x, walker.y - 62, "#ffe066", 11);
    ctx.globalAlpha = 1;
    return;
  }
  if (walker.paused) {
    art.draw(ctx, art.variant("hero-model", walker.variant), "front", walker.x, walker.y);
  } else if (!walker.path.length) {
    const stop = STOPS[walker.stop];
    const [sheet, frame] = stop.pose;
    art.draw(ctx, art.variant(sheet, walker.variant), frame, walker.x, walker.y - (Math.floor((t + walker.variant * 300) / 700) % 2));
    if (stop.balloon !== undefined && Math.floor((t + walker.variant * 900) / 2500) % 3 === 0) art.draw(ctx, "ui-balloons", stop.balloon, walker.x, walker.y - 60);
  } else if (Math.abs(walker.dx) > Math.abs(walker.dy)) {
    art.draw(ctx, art.variant("hero-walk", walker.variant), art.pose("hero-walk", "right", stride), walker.x, walker.y, walker.dx < 0);
  } else {
    const id = walker.dy > 0 ? "hero-walk" : "hero-walk-back";
    art.draw(ctx, art.variant(id, walker.variant), art.pose(id, walker.dy > 0 ? "front" : "back", stride), walker.x, walker.y);
  }
  label(ctx, walker.name, walker.x, walker.y + 13);
}
