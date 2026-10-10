import { label } from "./field";
import type { Sheets } from "./sheets";

// Street graph: walkers follow streets instead of cutting through houses.
export const NODES: Record<string, [number, number]> = {
  church: [300, 150], library: [690, 150], north: [480, 150], bridge: [480, 225],
  plazaN: [480, 270], plazaW: [395, 330], plazaE: [565, 330], plazaS: [480, 395],
  inn: [250, 330], board: [620, 268], shop: [700, 340], crystal: [410, 430],
  homeW: [190, 440], well: [120, 470], homeE: [770, 450], fire: [640, 450], gate: [480, 500],
};
export const EDGES: [string, string][] = [
  ["church", "north"], ["library", "north"], ["north", "bridge"], ["bridge", "plazaN"], ["plazaN", "plazaW"],
  ["plazaN", "plazaE"], ["plazaW", "plazaS"], ["plazaE", "plazaS"], ["plazaW", "inn"], ["plazaE", "board"],
  ["plazaE", "shop"], ["plazaS", "crystal"], ["crystal", "homeW"], ["homeW", "well"], ["plazaS", "fire"],
  ["fire", "homeE"], ["plazaS", "gate"],
];
const STOPS: { node: string; pose: [string, number]; balloon?: number }[] = [
  { node: "plazaW", pose: ["hero-model", 0], balloon: 1 }, { node: "plazaE", pose: ["hero-model", 0], balloon: 4 },
  { node: "board", pose: ["hero-model", 1] }, { node: "shop", pose: ["hero-model", 1] },
  { node: "well", pose: ["hero-model", 1] }, { node: "bridge", pose: ["hero-town", 4], balloon: 4 },
  { node: "fire", pose: ["hero-model", 0], balloon: 6 }, { node: "crystal", pose: ["hero-town", 1] },
  { node: "library", pose: ["hero-town", 0] }, { node: "homeE", pose: ["hero-model", 0] },
];
export type Walker = {
  id: string; name: string; variant: number; x: number; y: number; at: string; stop: number; path: string[];
  waitUntil: number; walked: number; dx: number; dy: number; party: string[];
  leaving?: boolean; wavedAt?: number;
};
export type TownSign = { name: string; x: number; y: number; icon: number };
export type Departed = { name: string; repo: string; left: string; last: string };

function route(from: string, to: string): string[] {
  const previous = new Map<string, string>([[from, ""]]);
  const queue = [from];
  while (queue.length) {
    const node = queue.shift()!;
    if (node === to) break;
    for (const [a, b] of EDGES) {
      const next = a === node ? b : b === node ? a : undefined;
      if (next && !previous.has(next)) { previous.set(next, node); queue.push(next); }
    }
  }
  const path: string[] = [];
  for (let node = to; node && node !== from; node = previous.get(node)!) path.unshift(node);
  return path;
}

export function makeWalker(id: string, name: string, variant: number, index: number): Walker {
  const stop = index % STOPS.length;
  const at = STOPS[stop].node;
  const [x, y] = NODES[at];
  return { id, name, variant, x, y, at, stop, path: [], waitUntil: 0, walked: 0, dx: 0, dy: 1, party: [] };
}

export function leave(walker: Walker): void {
  walker.at = Object.entries(NODES).sort(([, a], [, b]) => Math.hypot(a[0] - walker.x, a[1] - walker.y) - Math.hypot(b[0] - walker.x, b[1] - walker.y))[0][0];
  walker.leaving = true;
  walker.path = route(walker.at, "gate");
  if (Math.hypot(NODES[walker.at][0] - walker.x, NODES[walker.at][1] - walker.y) > 1) walker.path.unshift(walker.at);
}

export function returnWalker(walker: Walker): void {
  walker.x = NODES.gate[0]; walker.y = NODES.gate[1] + 20; walker.at = "gate";
  walker.path = route("gate", STOPS[walker.stop].node); walker.dy = -1;
}

export function stepWalkers(walkers: Walker[], t: number, dt: number): Walker[] {
  const departed: Walker[] = [];
  for (const walker of walkers) {
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
      walker.path = route(walker.at, STOPS[walker.stop].node);
      walker.waitUntil = 0;
      continue;
    }
    const [tx, ty] = NODES[walker.path[0]];
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
  walker.party.forEach((id, i) => art.draw(ctx, id, walker.path.length ? stride % 2 : 0, walker.x - 22 - i * 18, walker.y + 12 + i * 12));
  if (walker.leaving && !walker.path.length) {
    const age = t - (walker.wavedAt ?? t);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - 1000) / 600);
    art.draw(ctx, art.variant(Math.floor(age / 250) % 2 ? "hero-town" : "hero-model", walker.variant), Math.floor(age / 250) % 2 ? 2 : 0, walker.x, walker.y);
    label(ctx, "またね！", walker.x, walker.y - 62, "#ffe066", 11);
    ctx.globalAlpha = 1;
    return;
  }
  if (!walker.path.length) {
    const stop = STOPS[walker.stop];
    const [sheet, frame] = stop.pose;
    art.draw(ctx, art.variant(sheet, walker.variant), frame, walker.x, walker.y - (Math.floor((t + walker.variant * 300) / 700) % 2));
    if (stop.balloon !== undefined && Math.floor((t + walker.variant * 900) / 2500) % 3 === 0) art.draw(ctx, "ui-balloons", stop.balloon, walker.x, walker.y - 60);
  } else if (Math.abs(walker.dx) > Math.abs(walker.dy)) {
    art.draw(ctx, art.variant("hero-walk", walker.variant), 4 + stride, walker.x, walker.y, walker.dx < 0);
  } else {
    art.draw(ctx, art.variant(walker.dy > 0 ? "hero-walk" : "hero-walk-back", walker.variant), stride, walker.x, walker.y);
  }
  label(ctx, walker.name, walker.x, walker.y + 13);
}
