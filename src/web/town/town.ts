import { label, placeTitle } from "./field";
import { drawNoticeHero, type NoticeMarkFrame } from "./notice-mark";
import { drawWeather, THEME_NAMES, type TownTheme } from "./themes";
import { drawWalker, type Walker, type TownSign } from "./walkers";
import type { Sheets } from "./sheets";
import { townLayout, type Look, type Part, type Point } from "./art-data";

export const TOWN_W = 960;
export const TOWN_H = 540;
export const townSpots = (art: Sheets, theme?: TownTheme) => townLayout(art.entry("bld-inn").town!, theme).spots;
let ground: HTMLCanvasElement | undefined;
let groundTheme: TownTheme | undefined;

// Ground and walking use the same 16px cells. No freehand masks or scattered texture patches.
const CELL = 16;
const COLS = TOWN_W / CELL, ROWS = Math.ceil(TOWN_H / CELL);
function paintGround(art: Sheets, look: Look): HTMLCanvasElement {
  const town = art.entry("bld-inn").town!, { nodes, edges, paved, plaza, river } = town;
  const canvas = document.createElement("canvas");
  canvas.width = TOWN_W; canvas.height = TOWN_H;
  const c = canvas.getContext("2d")!;
  c.imageSmoothingEnabled = false;
  if (look.backdrop) {
    c.drawImage(art.image(look.backdrop[0])!, 0, 0, TOWN_W, TOWN_H);
    return canvas;
  }
  // 0 ground, 1 earth path, 2 paved street, 3 water, 4 doorstep.
  const cells = new Uint8Array(COLS * ROWS);
  const get = (x: number, y: number) => x < 0 || y < 0 || x >= COLS || y >= ROWS ? -1 : cells[y * COLS + x];
  const put = (x: number, y: number, kind: number) => {
    if (x >= 0 && y >= 0 && x < COLS && y < ROWS) cells[y * COLS + x] = kind;
  };
  const line = (a: Point, b: Point, kind: number, radius = 1) => {
    const ax = Math.floor(a[0] / CELL), ay = Math.floor(a[1] / CELL);
    const bx = Math.floor(b[0] / CELL), by = Math.floor(b[1] / CELL);
    for (let y = Math.min(ay, by) - radius; y <= Math.max(ay, by) + radius; y++) {
      for (let x = Math.min(ax, bx) - radius; x <= Math.max(ax, bx) + radius; x++) put(x, y, kind);
    }
  };
  const isPaved = (a: string, b: string) => paved.some(([p, q]) => (p === a && q === b) || (p === b && q === a));
  for (const [a, b] of edges) if (!isPaved(a, b)) line(nodes[a], nodes[b], 1);
  for (const [key, door] of Object.entries(town.entrances)) line(door, nodes[key], 4);
  for (let y = plaza.y / CELL; y < (plaza.y + plaza.h) / CELL; y++) {
    for (let x = plaza.x / CELL; x < (plaza.x + plaza.w) / CELL; x++) put(x, y, 2);
  }
  for (const [a, b] of paved) line(nodes[a], nodes[b], 2);
  line(nodes.gate, [nodes.gate[0], TOWN_H], 2);
  // The fountain's planted island leaves all four circulation lanes clear.
  for (let y = 16; y < 19; y++) for (let x = 28; x < 32; x++) put(x, y, 0);
  for (let i = 1; i < river.points.length; i++) line(river.points[i - 1], river.points[i], 3, 1);
  const materials = [look.ground, look.path, look.street, look.river, look.path];
  const blit = (part: Part, sx: number, sy: number, sw: number, sh: number, x: number, y: number, w = sw, h = sh) => {
    const image = art.image(part[0])!;
    const [fw] = art.size(part[0]);
    c.drawImage(image, art.index(part[0], part[1]) * fw + sx, sy, sw, sh, x, y, w, h);
  };
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const kind = get(x, y), px = x * CELL, py = y * CELL;
    // Whole 48px ground motifs keep coherent clumps; every motif shares its repeat edge.
    const clump = ((Math.floor(x / 3) * 7 + Math.floor(y / 3) * 11) % 9) < 2;
    blit([look.ground[0], clump ? "clumps" : "ground"], x % 3 * CELL, y % 3 * CELL, CELL, CELL, px, py);
    if (!kind) continue;
    const part = materials[kind];
    // Paths meet paving without a curb across the walking line; water always has its bank.
    const connected = (dx: number, dy: number) => {
      const next = get(x + dx, y + dy);
      return next === kind || (kind !== 3 && next > 0 && next !== 3) || next === -1;
    };
    const inset = kind === 1 ? 6 : kind === 4 ? 12 : 0;
    const left = connected(-1, 0) ? 0 : inset, right = connected(1, 0) ? 16 : 16 - inset;
    const topEdge = connected(0, -1) ? 0 : inset, bottom = connected(0, 1) ? 16 : 16 - inset;
    const xs = [left, Math.floor((left + right) / 2), right];
    const ys = [topEdge, Math.floor((topEdge + bottom) / 2), bottom];
    for (const qy of [0, 1]) for (const qx of [0, 1]) {
      const dx = qx ? 1 : -1, dy = qy ? 1 : -1;
      const side = !connected(dx, 0), top = !connected(0, dy);
      const sx = side ? (qx ? 40 : 0) : 16 + qx * 8;
      const sy = top ? (qy ? 40 : 0) : 16 + qy * 8;
      blit(part, sx, sy, 8, 8, px + xs[qx], py + ys[qy], xs[qx + 1] - xs[qx], ys[qy + 1] - ys[qy]);
      // A missing diagonal contributes only the inward corner, never a line across a junction.
      if (!side && !top && !connected(dx, dy)) {
        blit(part, qx ? 45 : 0, qy ? 45 : 0, 3, 3, px + qx * 13, py + qy * 13);
      }
    }
  }
  art.draw(c, "obj-river", "wooden bridge", ...river.bridge);
  return canvas;
}

function churchLight(ctx: CanvasRenderingContext2D, art: Sheets, church: Part, x: number, y: number, t: number): void {
  ctx.save();
  ctx.fillStyle = "#ffe066";
  for (const [dx, dy, w, h] of art.entry(church[0]).windows?.[church[1]] ?? []) {
    const left = Math.round(x + dx - w / 2), top = Math.round(y + dy - h / 2);
    ctx.globalAlpha = 0.08 + Math.sin(t / 700) * 0.025;
    ctx.fillRect(left - 7, top - 4, w + 14, h + 8);
    ctx.fillRect(left - 4, top - 7, w + 8, h + 14);
    ctx.globalAlpha = 0.42 + Math.sin(t / 700) * 0.1;
    ctx.fillRect(left, top, w, h);
  }
  ctx.restore();
}

type TownData = {
  sleepers: number; prayers?: number; theme: TownTheme; name: string; walkers: Walker[];
  reports?: TownSign[]; caller?: { name: string; x: number; y: number }; read?: Set<string>; notice?: NoticeMarkFrame;
};

export function drawTown(ctx: CanvasRenderingContext2D, art: Sheets, t: number, data: TownData): void {
  const { theme, name, sleepers, walkers, reports = [], caller, read } = data;
  const base = art.entry("bld-inn").town!, look = base.looks[theme];
  const town = { ...base, ...townLayout(base, theme) }, building = town.buildings;
  if (!ground || groundTheme !== theme) { ground = paintGround(art, look); groundTheme = theme; }
  ctx.drawImage(ground, 0, 0);
  const items: { y: number; draw: () => void }[] = [];
  const put = (id: string, frame: string, x: number, y: number) => items.push({ y, draw: () => art.draw(ctx, id, frame, x, y) });
  if (look.backdrop) {
    // Hard contact shadows follow the foundations, without a blurred halo.
    ctx.fillStyle = "#3e3546";
    for (const key of ["church", "library", "inn", "shop"] as const) {
      const [x, y] = building[key], width = art.size(look[key][0])[0] - 16;
      ctx.fillRect(Math.round(x - width / 2 + 2), y - 2, width, 3);
    }
  }
  items.push({ y: building.church[1], draw: () => {
    art.draw(ctx, look.church[0], look.church[1], ...building.church);
    if (data.prayers) churchLight(ctx, art, look.church, ...building.church, t);
  } });
  put(look.library[0], look.library[1], ...building.library);
  if (!look.backdrop) {
    town.trees.forEach((point, i) => put(...look.trees[i % 2], ...point));
    town.lamps.forEach((point) => put(...look.lamp, ...point));
    const [centre, frames] = look.centre;
    put(centre, frames[Math.floor(t / 160) % frames.length], ...town.centre);
    town.benches.forEach((point) => put("obj-town", "bench", ...point));
    const cliff = art.size(look.cliff[0])[0] - 2;
    for (const [left, right, y] of town.cliffs) for (let x = left + cliff / 2; x < right + cliff / 2; x += cliff) put(...look.cliff, x, y);
    put(look.cliff[0], "stone stairs", ...town.stairs);
    if (look.waterfall) put("obj-river", `waterfall ${1 + Math.floor(t / 200) % 2}`, ...town.river.waterfall);
  }
  put(...look.inn, ...building.inn);
  put("bld-questboard", "board", ...building.board); put(...look.shop, ...building.shop);
  put("obj-crystal", art.pose("obj-crystal", "glow", Math.floor(t / 220) % 4), ...town.crystal);
  put("obj-campfire", art.pose("obj-campfire", "fire", Math.floor(t / 140) % 4), ...town.fire);
  if (!look.backdrop) {
    building.houses.forEach((point, i) => put(...look.houses[i % look.houses.length], ...point));
    for (const [id, frame, x, y] of look.extras) put(id, frame, x, y);
    const fence = art.size("obj-fence-sign")[0] - town.fences.overlap;
    for (const [start, end] of town.fences.ranges) for (let x = start; x < end; x += fence) put("obj-fence-sign", "fence", x, town.fences.y);
    for (const point of town.gatePosts) put("obj-fence-sign", "gate post", ...point);
  }
  if (caller) items.push({ y: caller.y, draw: () => {
    const mark = data.notice?.id === caller.name ? data.notice : undefined;
    drawNoticeHero(ctx, art, art.variant("hero-town", 3), "call", caller.x, caller.y - (Math.floor(t / 300) % 2), mark);
    art.draw(ctx, "ui-balloons", "exclamation", caller.x, caller.y - 59);
    if (mark) mark.signTop = art.spriteTop("ui-balloons", "exclamation", caller.y - 59);
    label(ctx, caller.name, caller.x, caller.y + 13);
  } });
  for (const report of reports) items.push({ y: report.y, draw: () => {
    const mark = data.notice?.id === report.name ? data.notice : undefined;
    drawNoticeHero(ctx, art, art.variant("hero-model", report.name.length % 5), "front", report.x, report.y, mark);
    const unread = !read?.has(report.name), signY = report.y - 56 - (unread ? Math.floor(t / 400) % 2 : 0);
    art.draw(ctx, "ui-report", report.icon, report.x, signY);
    if (unread) art.draw(ctx, "ui-balloons", "exclamation", report.x + 16, report.y - 72);
    if (mark) mark.signTop = Math.min(art.spriteTop("ui-report", report.icon, signY),
      unread ? art.spriteTop("ui-balloons", "exclamation", report.y - 72) : Infinity);
    label(ctx, report.name, report.x, report.y + 13);
  } });
  for (const walker of walkers) items.push({ y: walker.y, draw: () => drawWalker(ctx, art, walker, t, data.notice) });
  for (const item of items.sort((a, b) => a.y - b.y)) item.draw();
  drawWeather(ctx, art, theme, t);
  if (look.tint) { ctx.fillStyle = look.tint; ctx.fillRect(0, 0, TOWN_W, TOWN_H); }
  if (sleepers) {
    const [x, y] = building.inn, { balloon, count } = town.innSleep;
    art.draw(ctx, "ui-balloons", "sleep Zz", x + balloon[0], y + balloon[1] + (Math.floor(t / 500) % 2));
    label(ctx, `×${sleepers}`, x + count[0], y + count[1], "#ffffff", 11);
  }
  for (const [text, [x, y]] of [["やどや", building.inn], ["きょうかい", building.church]] as const) {
    // Mount above the doorway, clear of the walking lane and the inn's sleep balloon.
    const width = text.length * 12 + 12, left = x - width / 2, top = y - 66;
    ctx.fillStyle = "#0a0a1a"; ctx.fillRect(left - 1, top - 1, width + 2, 24);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(left, top, width, 22);
    ctx.fillStyle = "#0a0a1a"; ctx.fillRect(left + 1, top + 1, width - 2, 20);
    label(ctx, text, x, top + 15, "#ffffff", 12);
  }
  placeTitle(ctx, `まち（${THEME_NAMES[theme]}）`, TOWN_W / 2, 8, name);
}
