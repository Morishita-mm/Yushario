import { label } from "./field";
import { drawWeather, THEME_NAMES, type TownTheme } from "./themes";
import { drawWalker, type Walker, type TownSign } from "./walkers";
import type { Sheets } from "./sheets";
import type { Part } from "./art-data";

export const TOWN_W = 960;
export const TOWN_H = 540;
export const townSpots = (art: Sheets) => art.entry("bld-inn").town!.spots;
let streets: HTMLCanvasElement | undefined;
let streetsTheme: TownTheme | undefined;

// Streets are shared by every town: crisp discs along the graph, filled with cobbles.
function paintStreets(art: Sheets, street: Part): HTMLCanvasElement {
  const { nodes, edges } = art.entry("bld-inn").town!;
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
  for (const [a, b] of edges) {
    const [x0, y0] = nodes[a], [x1, y1] = nodes[b];
    const length = Math.hypot(x1 - x0, y1 - y0) || 1;
    const bend = ((x0 + y1) % 3) - 1;
    for (let i = 0, steps = Math.ceil(length / 2); i <= steps; i++) {
      const t = i / steps, curve = Math.sin(t * Math.PI) * bend * 10;
      disc(x0 + (x1 - x0) * t + curve * (y1 - y0) / length, y0 + (y1 - y0) * t - curve * (x1 - x0) / length, 12);
    }
  }
  const [cx, cy] = nodes.plazaW;
  disc((cx + nodes.plazaE[0]) / 2, cy + 2, 62);
  const canvas = document.createElement("canvas");
  canvas.width = TOWN_W; canvas.height = TOWN_H;
  const c = canvas.getContext("2d")!;
  art.texture(c, street[0], street[1], 0, 0, TOWN_W, TOWN_H);
  c.globalCompositeOperation = "destination-in";
  c.drawImage(mask, 0, 0);
  return canvas;
}

// Keep the bridge's deck/wing walls, removing the water colours sampled from the named canal frame.
const decks = new Map<boolean, HTMLCanvasElement>();
function bridgeDeck(art: Sheets, walled: boolean): HTMLCanvasElement | undefined {
  const image = art.image("obj-canal");
  if (decks.has(walled) || !image) return decks.get(walled);
  const entry = art.entry("obj-canal"), [w, h] = entry.frame, bridge = entry.bridge!;
  const [left, width] = walled ? bridge.cuts.walled : bridge.cuts.open;
  const canvas = document.createElement("canvas");
  canvas.width = image.width; canvas.height = h;
  const c = canvas.getContext("2d", { willReadFrequently: true })!;
  c.drawImage(image, 0, 0);
  const sheet = c.getImageData(0, 0, image.width, h).data;
  const water = new Set<number>(), waterX = art.index("obj-canal", bridge.waterFrame) * w;
  for (let y = bridge.waterRows[0]; y <= bridge.waterRows[1]; y++) for (let x = 0; x < w; x++) {
    const i = (y * image.width + waterX + x) * 4;
    water.add((sheet[i] << 16) | (sheet[i + 1] << 8) | sheet[i + 2]);
  }
  const cut = c.getImageData(art.index("obj-canal", bridge.deckFrame) * w + left, 0, width, h);
  for (let i = 0; i < cut.data.length; i += 4) {
    if (water.has((cut.data[i] << 16) | (cut.data[i + 1] << 8) | cut.data[i + 2])) cut.data[i + 3] = 0;
  }
  canvas.width = width;
  c.putImageData(cut, 0, 0);
  decks.set(walled, canvas);
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
  sleepers: number; prayers?: number; theme: TownTheme; name: string; walkers: Walker[]; unread?: number;
  reports?: TownSign[]; caller?: { name: string; x: number; y: number }; read?: Set<string>;
};

export function drawTown(ctx: CanvasRenderingContext2D, art: Sheets, t: number, data: TownData): void {
  const { theme, name, sleepers, walkers, reports = [], caller, read } = data;
  const town = art.entry("bld-inn").town!, look = town.looks[theme], building = town.buildings;
  const bridge = art.entry("obj-canal").bridge!;
  if (!streets || streetsTheme !== theme) { streets = paintStreets(art, look.street); streetsTheme = theme; }
  art.texture(ctx, look.ground[0], look.ground[1], 0, 0, TOWN_W, TOWN_H);
  ctx.drawImage(streets, 0, 0);
  if (look.canal?.[0] === "obj-canal") {
    const canal = art.size("obj-canal")[0];
    for (let x = canal / 2 + bridge.canal.start; x < TOWN_W + canal; x += canal - bridge.canal.overlap) art.draw(ctx, "obj-canal", bridge.waterFrame, x, bridge.canal.bottom);
  } else if (look.canal) art.texture(ctx, look.canal[0], look.canal[1], 0, bridge.band.top, TOWN_W, bridge.band.height);
  const walled = look.canal?.[0] === "obj-canal";
  const deck = look.canal && bridgeDeck(art, walled);
  if (deck) ctx.drawImage(deck, town.nodes.bridge[0] - deck.width / 2, walled ? bridge.top.walled : bridge.top.open);
  const items: { y: number; draw: () => void }[] = [];
  const put = (id: string, frame: string, x: number, y: number) => items.push({ y, draw: () => art.draw(ctx, id, frame, x, y) });
  items.push({ y: building.church[1], draw: () => {
    art.draw(ctx, look.church[0], look.church[1], ...building.church);
    if (data.prayers) churchLight(ctx, art, look.church, ...building.church, t);
  } });
  put(look.library[0], look.library[1], ...building.library);
  town.trees.forEach((point, i) => put(...look.trees[i % 2], ...point));
  town.lamps.slice(0, 2).forEach((point) => put(...look.lamp, ...point));
  const [centre, frames] = look.centre;
  put(centre, frames[Math.floor(t / 160) % frames.length], ...town.centre);
  town.benches.forEach((point) => put("obj-town", "bench", ...point));
  town.lamps.slice(2).forEach((point) => put(...look.lamp, ...point));
  put(...look.inn, ...building.inn);
  put("bld-questboard", "board", ...building.board); put(...look.shop, ...building.shop);
  put("obj-crystal", art.pose("obj-crystal", "glow", Math.floor(t / 220) % 4), ...town.crystal);
  put("obj-campfire", art.pose("obj-campfire", "fire", Math.floor(t / 140) % 4), ...town.fire);
  building.houses.forEach((point, i) => put(...look.houses[i], ...point));
  for (const [id, frame, x, y] of look.extras) put(id, frame, x, y);
  const fence = art.size("obj-fence-sign")[0] - town.fences.overlap;
  for (const [start, end] of town.fences.ranges) for (let x = start; x < end; x += fence) put("obj-fence-sign", "fence", x, town.fences.y);
  const wall = art.size("town-wall")[0] - town.walls.overlap;
  for (let x = 0; x < TOWN_W + wall; x += wall) if (Math.abs(x - town.walls.gate) > town.walls.gap) put("town-wall", "wall segment", x, town.walls.y);
  for (const x of town.walls.towers) put("town-wall", "corner tower", x, town.walls.y);
  put("town-wall", "town gate", town.walls.gate, town.walls.y);
  if (caller) items.push({ y: caller.y, draw: () => {
    art.draw(ctx, art.variant("hero-town", 3), "call", caller.x, caller.y - (Math.floor(t / 300) % 2));
    art.draw(ctx, "ui-balloons", "exclamation", caller.x, caller.y - 59);
    label(ctx, caller.name, caller.x, caller.y + 13);
  } });
  for (const report of reports) items.push({ y: report.y, draw: () => {
    art.draw(ctx, art.variant("hero-model", report.name.length % 5), "front", report.x, report.y);
    const unread = !read?.has(report.name);
    art.draw(ctx, "ui-report", report.icon, report.x, report.y - 56 - (unread ? Math.floor(t / 400) % 2 : 0));
    if (unread) art.draw(ctx, "ui-balloons", "exclamation", report.x + 16, report.y - 72);
    label(ctx, report.name, report.x, report.y + 13);
  } });
  for (const walker of walkers) items.push({ y: walker.y, draw: () => drawWalker(ctx, art, walker, t) });
  for (const item of items.sort((a, b) => a.y - b.y)) item.draw();
  drawWeather(ctx, art, theme, t);
  if (look.tint) { ctx.fillStyle = look.tint; ctx.fillRect(0, 0, TOWN_W, TOWN_H); }
  if (sleepers) {
    const [x, y] = building.inn, { balloon, count } = town.innSleep;
    art.draw(ctx, "ui-balloons", "sleep Zz", x + balloon[0], y + balloon[1] + (Math.floor(t / 500) % 2));
    label(ctx, `×${sleepers}`, x + count[0], y + count[1], "#ffffff", 11);
  }
  for (const [text, [x, y]] of [["やどや", building.inn], ["きょうかい", building.church], ["としょかん", building.library], ["どうぐや", building.shop]] as const) label(ctx, text, x, y + 16, "#fff7d6");
  label(ctx, `${name}の まち（${THEME_NAMES[theme]}）${data.unread ? ` 📜${data.unread}` : ""}`, TOWN_W / 2, 26, "#fff7d6", 14);
}
