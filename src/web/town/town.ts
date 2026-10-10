import { label } from "./field";
import { drawWeather, LOOKS, THEME_NAMES, type TownTheme } from "./themes";
import { NODES, EDGES, drawWalker, type Walker, type TownSign } from "./walkers";
import type { Sheets } from "./sheets";

export const TOWN_W = 960;
export const TOWN_H = 540;
export const TOWN_SPOTS = { inn: { x: 195, y: 215, w: 120, h: 125 } };
let streets: HTMLCanvasElement | undefined;
let streetsTheme: TownTheme | undefined;

// Streets are shared by every town: crisp discs along the graph, filled with cobbles.
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
    const bend = ((x0 + y1) % 3) - 1;
    for (let i = 0, steps = Math.ceil(length / 2); i <= steps; i++) {
      const t = i / steps, curve = Math.sin(t * Math.PI) * bend * 10;
      disc(x0 + (x1 - x0) * t + curve * (y1 - y0) / length, y0 + (y1 - y0) * t - curve * (x1 - x0) / length, 12);
    }
  }
  disc(480, 332, 62);
  const canvas = document.createElement("canvas");
  canvas.width = TOWN_W; canvas.height = TOWN_H;
  const c = canvas.getContext("2d")!;
  art.texture(c, street[0], street[1], 0, 0, TOWN_W, TOWN_H);
  c.globalCompositeOperation = "destination-in";
  c.drawImage(mask, 0, 0);
  return canvas;
}

// The stone bridge without its own water, so every town's river shows through under it. Cut once from
// frame 1 of obj-canal (with its wing walls, or just the deck and pillars); water colours come from frame 0.
const decks = new Map<boolean, HTMLCanvasElement>();
function bridgeDeck(art: Sheets, walled: boolean): HTMLCanvasElement | undefined {
  const image = art.image("obj-canal");
  if (decks.has(walled) || !image) return decks.get(walled);
  const [w, h] = art.size("obj-canal"), [left, width] = walled ? [26, 50] : [35, 32];
  const canvas = document.createElement("canvas");
  canvas.width = w * 2; canvas.height = h;
  const c = canvas.getContext("2d", { willReadFrequently: true })!;
  c.drawImage(image, 0, 0);
  const sheet = c.getImageData(0, 0, w * 2, h).data;
  const water = new Set<number>();
  for (let y = 23; y <= 41; y++) for (let x = 0; x < w; x++) {
    const i = (y * w * 2 + x) * 4;
    water.add((sheet[i] << 16) | (sheet[i + 1] << 8) | sheet[i + 2]);
  }
  const cut = c.getImageData(w + left, 0, width, h);
  for (let i = 0; i < cut.data.length; i += 4) {
    if (water.has((cut.data[i] << 16) | (cut.data[i + 1] << 8) | cut.data[i + 2])) cut.data[i + 3] = 0;
  }
  canvas.width = width;
  c.putImageData(cut, 0, 0);
  decks.set(walled, canvas);
  return canvas;
}

type TownData = {
  sleepers: number; theme: TownTheme; name: string; walkers: Walker[]; unread?: number;
  reports?: TownSign[]; caller?: { name: string; x: number; y: number }; read?: Set<string>;
};

export function drawTown(ctx: CanvasRenderingContext2D, art: Sheets, t: number, data: TownData): void {
  const { theme, name, sleepers, walkers, reports = [], caller, read } = data;
  const look = LOOKS[theme];
  if (!streets || streetsTheme !== theme) { streets = paintStreets(art, look.street); streetsTheme = theme; }
  art.texture(ctx, look.ground[0], look.ground[1], 0, 0, TOWN_W, TOWN_H);
  ctx.drawImage(streets, 0, 0);
  if (look.canal?.[0] === "obj-canal") {
    const canal = art.size("obj-canal")[0];
    for (let x = canal / 2 - 8; x < TOWN_W + canal; x += canal - 2) art.draw(ctx, "obj-canal", 0, x, 240);
  } else if (look.canal) art.texture(ctx, look.canal[0], look.canal[1], 0, 214, TOWN_W, 28);
  // Centre the bridge's water band (rows 20–37) on the river: 211–229 for the canal strip, 214–242 for a band.
  const walled = look.canal?.[0] === "obj-canal"; // only the stone canal has banks for the wing walls to meet
  const deck = look.canal && bridgeDeck(art, walled);
  if (deck) ctx.drawImage(deck, 480 - deck.width / 2, walled ? 192 : 199);
  const items: { y: number; draw: () => void }[] = [];
  const put = (id: string, frame: number, x: number, y: number) => items.push({ y, draw: () => art.draw(ctx, id, frame, x, y) });
  put(look.church[0], look.church[1], 300, 140); put(look.library[0], look.library[1], 690, 140);
  put(look.trees[0][0], look.trees[0][1], 120, 120); put(look.trees[1][0], look.trees[1][1], 870, 110);
  put(look.trees[0][0], look.trees[0][1], 930, 170); put(look.trees[1][0], look.trees[1][1], 40, 190);
  put(look.lamp[0], look.lamp[1], 420, 172); put(look.lamp[0], look.lamp[1], 560, 172);
  const [centre, frames] = look.centre;
  put(centre, frames[Math.floor(t / 160) % frames.length], 480, 360);
  put("obj-town", 3, 405, 400); put("obj-town", 3, 555, 400);
  put(look.lamp[0], look.lamp[1], 412, 292); put(look.lamp[0], look.lamp[1], 548, 292);
  put(look.inn[0], look.inn[1], 255, 332);
  put("bld-questboard", 0, 620, 258); put(look.shop[0], look.shop[1], 718, 332);
  put("obj-crystal", Math.floor(t / 220) % 4, 410, 455); put("obj-campfire", Math.floor(t / 140) % 4, 640, 468);
  put(look.houses[0][0], look.houses[0][1], 150, 432); put(look.houses[1][0], look.houses[1][1], 805, 442);
  for (const [id, frame, x, y] of look.extras) put(id, frame, x, y);
  const fence = art.size("obj-fence-sign")[0] - 4;
  for (let x = 40; x < 250; x += fence) put("obj-fence-sign", 0, x, 500);
  for (let x = 720; x < 930; x += fence) put("obj-fence-sign", 0, x, 500);
  const wall = art.size("town-wall")[0] - 4;
  for (let x = 0; x < TOWN_W + wall; x += wall) if (Math.abs(x - 480) > 64) put("town-wall", 0, x, 552);
  put("town-wall", 1, 14, 552); put("town-wall", 1, 946, 552); put("town-wall", 2, 480, 552);
  if (caller) items.push({ y: caller.y, draw: () => {
    art.draw(ctx, art.variant("hero-town", 3), 2, caller.x, caller.y - (Math.floor(t / 300) % 2));
    art.draw(ctx, "ui-balloons", 0, caller.x, caller.y - 59);
    label(ctx, caller.name, caller.x, caller.y + 13);
  } });
  for (const report of reports) items.push({ y: report.y, draw: () => {
    art.draw(ctx, art.variant("hero-model", report.name.length % 5), 0, report.x, report.y);
    const unread = !read?.has(report.name);
    art.draw(ctx, "ui-report", report.icon, report.x, report.y - 56 - (unread ? Math.floor(t / 400) % 2 : 0));
    if (unread) art.draw(ctx, "ui-balloons", 0, report.x + 16, report.y - 72);
    label(ctx, report.name, report.x, report.y + 13);
  } });
  for (const walker of walkers) items.push({ y: walker.y, draw: () => drawWalker(ctx, art, walker, t) });
  for (const item of items.sort((a, b) => a.y - b.y)) item.draw();
  drawWeather(ctx, art, theme, t);
  if (look.tint) { ctx.fillStyle = look.tint; ctx.fillRect(0, 0, TOWN_W, TOWN_H); }
  if (sleepers) {
    art.draw(ctx, "ui-balloons", 2, 296, 226 + (Math.floor(t / 500) % 2));
    label(ctx, `×${sleepers}`, 320, 216, "#ffffff", 11);
  }
  for (const [text, x, y] of [["やどや", 255, 348], ["きょうかい", 300, 156], ["としょかん", 690, 156], ["どうぐや", 718, 348]] as const) label(ctx, text, x, y, "#fff7d6");
  label(ctx, `${name}の まち（${THEME_NAMES[theme]}）${data.unread ? ` 📜${data.unread}` : ""}`, TOWN_W / 2, 26, "#fff7d6", 14);
}
