import { label } from "./mock-field";
import { drawWeather, LOOKS, THEME_NAMES, type TownTheme } from "./mock-themes";
import type { Sheets } from "./sheets";

// Mock: the town (960×540) where idle agents live, laid out like a classic JRPG town:
// upper district (church, library) across a canal, a fountain plaza in the middle with the inn and
// shop facing it, homes with yards to the south, and the town gate leading out to the fields.
export const TOWN_W = 960;
export const TOWN_H = 540;

type P = [number, number];
// Street graph: walkers follow streets instead of cutting through houses.
const NODES: Record<string, P> = {
  church: [300, 150], library: [690, 150], north: [480, 150], bridge: [480, 225],
  plazaN: [480, 270], plazaW: [395, 330], plazaE: [565, 330], plazaS: [480, 395],
  inn: [250, 330], board: [620, 268], shop: [700, 340], crystal: [410, 430],
  homeW: [190, 440], well: [120, 470], homeE: [770, 450], fire: [640, 450], gate: [480, 500],
};
const EDGES: [string, string][] = [
  ["church", "north"], ["library", "north"], ["north", "bridge"], ["bridge", "plazaN"], ["plazaN", "plazaW"],
  ["plazaN", "plazaE"], ["plazaW", "plazaS"], ["plazaE", "plazaS"], ["plazaW", "inn"], ["plazaE", "board"],
  ["plazaE", "shop"], ["plazaS", "crystal"], ["crystal", "homeW"], ["homeW", "well"], ["plazaS", "fire"],
  ["fire", "homeE"], ["plazaS", "gate"],
];
// Where strollers stop, and what they do there.
const STOPS: { node: string; pose: [string, number]; balloon?: number }[] = [
  { node: "plazaW", pose: ["hero-model", 0], balloon: 1 }, { node: "plazaE", pose: ["hero-model", 0], balloon: 4 },
  { node: "board", pose: ["hero-model", 1] }, { node: "shop", pose: ["hero-model", 1] },
  { node: "well", pose: ["hero-model", 1] }, { node: "bridge", pose: ["hero-town", 4], balloon: 4 },
  { node: "fire", pose: ["hero-model", 0], balloon: 6 }, { node: "crystal", pose: ["hero-town", 1] },
  { node: "library", pose: ["hero-town", 0] }, { node: "homeE", pose: ["hero-model", 0] },
];

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

interface Walker {
  name: string; variant: number; x: number; y: number; at: string; stop: number; path: string[];
  waitUntil: number; walked: number; dx: number; dy: number;
  leaving?: boolean; wavedAt?: number; // seen off: walking to the gate, then waving goodbye
}
const walkers: Walker[] = ["t23-lint", "t4-api", "t6-gesture", "t9-fixes", "t13-auth", "t14-db", "t17-ci"].map((name, i) => {
  const [x, y] = NODES[STOPS[i].node];
  return { name, variant: i % 5, x, y, at: STOPS[i].node, stop: i, path: [], waitUntil: 0, walked: 0, dx: 0, dy: 1 };
});
let lastT = 0;
let streets: HTMLCanvasElement | undefined;
let streetsTheme: TownTheme | undefined;

// Streets: stamp crisp, pixel-aligned discs along the street graph, then fill them with cobbles.
function paintStreets(art: Sheets, street: [string, number]): HTMLCanvasElement {
  const mask = document.createElement("canvas");
  mask.width = TOWN_W; mask.height = TOWN_H;
  const m = mask.getContext("2d")!;
  m.fillStyle = "#000";
  const disc = (cx: number, cy: number, r: number) => {
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.round(Math.sqrt(r * r - dy * dy));
      m.fillRect(Math.round(cx - half), Math.round(cy + dy), half * 2 + 1, 1);
    }
  };
  for (const [a, b] of EDGES) {
    const [x0, y0] = NODES[a], [x1, y1] = NODES[b];
    const length = Math.hypot(x1 - x0, y1 - y0) || 1;
    const bend = ((x0 + y1) % 3) - 1; // a gentle sideways bend, so streets are not ruler-straight
    for (let i = 0, steps = Math.ceil(length / 2); i <= steps; i++) {
      const t = i / steps;
      const curve = Math.sin(t * Math.PI) * bend * 10;
      disc(x0 + (x1 - x0) * t + curve * (y1 - y0) / length, y0 + (y1 - y0) * t - curve * (x1 - x0) / length, 12);
    }
  }
  disc(480, 332, 62); // the plaza
  const canvas = document.createElement("canvas");
  canvas.width = TOWN_W; canvas.height = TOWN_H;
  const c = canvas.getContext("2d")!;
  art.texture(c, street[0], street[1], 0, 0, TOWN_W, TOWN_H);
  c.globalCompositeOperation = "destination-in";
  c.drawImage(mask, 0, 0);
  return canvas;
}

// みおくる / よびもどす: heroes who set off are kept in the roster and can be called back.
export interface Departed { name: string; repo: string; left: string; last: string }
export const ROSTER: Departed[] = [
  { name: "t1-core", repo: "agent-character", left: "きのう 18:20", last: "Room の雛形と relay サーバーを作りました。" },
  { name: "t7-server", repo: "agent-character", left: "きょう 09:05", last: "JevDecider を追加し、失敗時はモックに戻るようにしました。" },
];
const gone = new Set<string>(); // reporters who have left

function nearestNode(x: number, y: number): string {
  return Object.entries(NODES).sort(([, a], [, b]) => Math.hypot(a[0] - x, a[1] - y) - Math.hypot(b[0] - x, b[1] - y))[0][0];
}

export function farewell(name: string): void {
  let walker = walkers.find((w) => w.name === name);
  const reporter = TOWN_REPORTS.find((r) => r.name === name);
  if (!walker && reporter) {
    gone.add(name);
    walker = { name, variant: name.length % 5, x: reporter.x, y: reporter.y, at: nearestNode(reporter.x, reporter.y), stop: -1, path: [], waitUntil: 0, walked: 0, dx: 0, dy: 1 };
    walkers.push(walker);
  }
  if (!walker) return;
  walker.leaving = true;
  walker.path = [...route(walker.at, "gate")];
  if (Math.hypot(NODES[walker.at][0] - walker.x, NODES[walker.at][1] - walker.y) > 1) walker.path.unshift(walker.at);
}

export function recall(name: string): void {
  const index = ROSTER.findIndex((d) => d.name === name);
  if (index < 0) return;
  ROSTER.splice(index, 1);
  const [x, y] = NODES.gate;
  const taken = new Set(walkers.map((w) => w.stop));
  const stop = STOPS.findIndex((_, i) => !taken.has(i));
  walkers.push({ name, variant: name.length % 5, x, y: y + 20, at: "gate", stop, path: route("gate", STOPS[stop].node), waitUntil: 0, walked: 0, dx: 0, dy: -1 });
}

// Heroes on the town map that can be clicked (walkers, reporters, the one calling you).
export function townHeroes(): { name: string; x: number; y: number }[] {
  return [
    ...walkers.filter((w) => !w.leaving).map((w) => ({ name: w.name, x: w.x, y: w.y })),
    ...TOWN_REPORTS.filter((r) => !gone.has(r.name)).map((r) => ({ name: r.name, x: r.x, y: r.y })),
    { name: "t11-callme", x: 560, y: 432 },
  ];
}

function step(walker: Walker, t: number, dt: number): void {
  if (walker.leaving && !walker.path.length) {
    walker.wavedAt ??= t;
    if (t - walker.wavedAt > 1600) {
      walkers.splice(walkers.indexOf(walker), 1);
      ROSTER.unshift({ name: walker.name, repo: "agent-character", left: "いま", last: "（さいごの ほうこくが ここに のこる）" });
    }
    return;
  }
  if (!walker.path.length) {
    if (!walker.waitUntil) walker.waitUntil = t + 3000 + Math.random() * 5000;
    if (t < walker.waitUntil) return;
    const taken = new Set(walkers.map((w) => w.stop));
    const free = STOPS.map((_, i) => i).filter((i) => !taken.has(i));
    walker.stop = free[Math.floor(Math.random() * free.length)] ?? walker.stop;
    walker.path = route(walker.at, STOPS[walker.stop].node);
    walker.waitUntil = 0;
    return;
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

function drawWalker(ctx: CanvasRenderingContext2D, art: Sheets, walker: Walker, t: number): void {
  const stride = Math.floor(walker.walked / 7) % 4;
  if (walker.leaving && !walker.path.length) {
    // At the gate: wave goodbye, then fade out.
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
    if (stop.balloon !== undefined && Math.floor((t + walker.variant * 900) / 2500) % 3 === 0) {
      art.draw(ctx, "ui-balloons", stop.balloon, walker.x, walker.y - 60);
    }
  } else if (Math.abs(walker.dx) > Math.abs(walker.dy)) {
    art.draw(ctx, art.variant("hero-walk", walker.variant), 4 + stride, walker.x, walker.y, walker.dx < 0);
  } else {
    art.draw(ctx, art.variant(walker.dy > 0 ? "hero-walk" : "hero-walk-back", walker.variant), stride, walker.x, walker.y);
  }
  label(ctx, walker.name, walker.x, walker.y + 13);
}

// Clickable places on the town map (map pixels).
export const TOWN_SPOTS = { inn: { x: 195, y: 215, w: 120, h: 125 } };

// Agents who finished something in town carry a sign of it: a scroll (research), a speech bubble (reply).
export const TOWN_REPORTS = [
  { kind: "research" as const, name: "t5-hooks", x: 345, y: 420, icon: 2 },
  { kind: "reply" as const, name: "t2-docs", x: 610, y: 400, icon: 4 },
];

export function drawTown(ctx: CanvasRenderingContext2D, art: Sheets, t: number, sleepers: number, theme: TownTheme, name: string, read: Set<string>): void {
  const look = LOOKS[theme];
  const dt = Math.min(100, t - lastT);
  lastT = t;
  if (!streets || streetsTheme !== theme) { streets = paintStreets(art, look.street); streetsTheme = theme; }
  art.texture(ctx, look.ground[0], look.ground[1], 0, 0, TOWN_W, TOWN_H);
  ctx.drawImage(streets, 0, 0);
  // The band across the town: a canal, an inlet of the sea, a frozen stream or nothing.
  if (look.canal?.[0] === "obj-canal") {
    const canal = art.size("obj-canal")[0];
    for (let x = canal / 2 - 8; x < TOWN_W + canal; x += canal - 2) art.draw(ctx, "obj-canal", 0, x, 240);
  } else if (look.canal) {
    art.texture(ctx, look.canal[0], look.canal[1], 0, 214, TOWN_W, 28);
  }
  if (look.canal) art.draw(ctx, "obj-canal", 1, 480, 248);
  const items: { y: number; draw: () => void }[] = [];
  const put = (id: string, frame: number, x: number, y: number) => items.push({ y, draw: () => art.draw(ctx, id, frame, x, y) });
  // Upper district.
  put(look.church[0], look.church[1], 300, 140); put(look.library[0], look.library[1], 690, 140);
  put(look.trees[0][0], look.trees[0][1], 120, 120); put(look.trees[1][0], look.trees[1][1], 870, 110);
  put(look.trees[0][0], look.trees[0][1], 930, 170); put(look.trees[1][0], look.trees[1][1], 40, 190);
  put(look.lamp[0], look.lamp[1], 420, 172); put(look.lamp[0], look.lamp[1], 560, 172);
  // Plaza: centrepiece, benches, lamps; inn and shop facing it.
  const [centre, frames] = look.centre;
  put(centre, frames[Math.floor(t / 160) % frames.length], 480, 360);
  put("obj-town", 3, 405, 400); put("obj-town", 3, 555, 400);
  put(look.lamp[0], look.lamp[1], 412, 292); put(look.lamp[0], look.lamp[1], 548, 292);
  put(look.inn[0], look.inn[1], 255, 332);
  put("bld-questboard", 0, 620, 258);
  put(look.shop[0], look.shop[1], 718, 332);
  put("obj-crystal", Math.floor(t / 220) % 4, 410, 455);
  put("obj-campfire", Math.floor(t / 140) % 4, 640, 468);
  // Homes to the south, and the local landmarks.
  put(look.houses[0][0], look.houses[0][1], 150, 432);
  put(look.houses[1][0], look.houses[1][1], 805, 442);
  for (const [id, frame, x, y] of look.extras) put(id, frame, x, y);
  const fence = art.size("obj-fence-sign")[0] - 4;
  for (let x = 40; x < 250; x += fence) put("obj-fence-sign", 0, x, 500);
  for (let x = 720; x < 930; x += fence) put("obj-fence-sign", 0, x, 500);
  // Town wall along the south with the gate out to the fields.
  const wall = art.size("town-wall")[0] - 4;
  for (let x = 0; x < TOWN_W + wall; x += wall) if (Math.abs(x - 480) > 64) put("town-wall", 0, x, 552);
  put("town-wall", 1, 14, 552); put("town-wall", 1, 946, 552); put("town-wall", 2, 480, 552);
  // Someone needs you: they come to the front and wave.
  items.push({ y: 432, draw: () => {
    art.draw(ctx, art.variant("hero-town", 3), 2, 560, 432 - (Math.floor(t / 300) % 2));
    art.draw(ctx, "ui-balloons", 0, 560, 373);
    label(ctx, "t11-callme", 560, 445);
  } });
  // Finished work: a sign over their head (scroll, speech bubble).
  for (const report of TOWN_REPORTS) {
    if (gone.has(report.name)) continue;
    items.push({ y: report.y, draw: () => {
      art.draw(ctx, art.variant("hero-model", report.name.length % 5), 0, report.x, report.y);
      // The sign stays after reading, so you can come back to it (and answer a reply later);
      // unread ones bob and carry a "!".
      const unread = !read.has(report.name);
      art.draw(ctx, "ui-report", report.icon, report.x, report.y - 56 - (unread ? Math.floor(t / 400) % 2 : 0));
      if (unread) art.draw(ctx, "ui-balloons", 0, report.x + 16, report.y - 72);
      label(ctx, report.name, report.x, report.y + 13);
    } });
  }
  for (const walker of walkers) step(walker, t, dt);
  for (const walker of walkers) items.push({ y: walker.y, draw: () => drawWalker(ctx, art, walker, t) });
  for (const item of items.sort((a, b) => a.y - b.y)) item.draw();
  drawWeather(ctx, art, theme, t);
  if (look.tint) { ctx.fillStyle = look.tint; ctx.fillRect(0, 0, TOWN_W, TOWN_H); }
  // Sleepers are inside the inn; show how many.
  if (sleepers) {
    art.draw(ctx, "ui-balloons", 2, 296, 226 + (Math.floor(t / 500) % 2));
    label(ctx, `×${sleepers}`, 320, 216, "#ffffff", 11);
  }
  for (const [text, x, y] of [["やどや", 255, 348], ["きょうかい", 300, 156], ["としょかん", 690, 156], ["どうぐや", 718, 348]] as const) {
    label(ctx, text, x, y, "#fff7d6");
  }
  label(ctx, `${name}の まち（${THEME_NAMES[theme]}）`, TOWN_W / 2, 26, "#fff7d6", 14);
}
