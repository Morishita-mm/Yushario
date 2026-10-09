import type { TownTheme } from "./mock-themes";
import type { Sheets } from "./sheets";

// Mock: the world map. Every project (repository) is a town in the region of its kind.
// Only towns with agents in them are on the map; quiet ones sleep in a list. When one region has
// too many towns, they are shown as one bundle that opens a list.
export interface Project { repo: string; theme?: TownTheme; heroes: number; fighting: number; unread: number; calling: boolean }

export const PROJECTS: Project[] = [
  { repo: "agent-character", theme: "village", heroes: 18, fighting: 7, unread: 5, calling: true },
  { repo: "blog", theme: "village", heroes: 1, fighting: 0, unread: 1, calling: false },
  { repo: "shop-front", theme: "port", heroes: 3, fighting: 1, unread: 1, calling: false },
  { repo: "shop-api", theme: "port", heroes: 2, fighting: 2, unread: 0, calling: true },
  { repo: "shop-admin", theme: "port", heroes: 1, fighting: 0, unread: 2, calling: false },
  { repo: "payments", theme: "port", heroes: 2, fighting: 1, unread: 0, calling: false },
  { repo: "mail-worker", theme: "port", heroes: 1, fighting: 1, unread: 0, calling: false },
  { repo: "search-index", theme: "port", heroes: 1, fighting: 0, unread: 1, calling: false },
  { repo: "infra-tools", theme: "snow", heroes: 2, fighting: 0, unread: 0, calling: false },
  { repo: "data-pipeline", theme: "desert", heroes: 4, fighting: 2, unread: 2, calling: false },
  { repo: "game-engine", theme: "volcano", heroes: 1, fighting: 1, unread: 0, calling: true },
  { repo: "old-site", theme: "village", heroes: 0, fighting: 0, unread: 0, calling: false },
  { repo: "ml-notebooks", theme: "desert", heroes: 0, fighting: 0, unread: 0, calling: false },
  { repo: "dotfiles", theme: "snow", heroes: 0, fighting: 0, unread: 0, calling: false },
  { repo: "legacy-batch", theme: "volcano", heroes: 0, fighting: 0, unread: 0, calling: false },
  { repo: "new-mobile-app", heroes: 1, fighting: 0, unread: 0, calling: false }, // just arrived: no kind chosen yet
];
export const BUNDLE_AT = 5; // this many active towns in one region become one bundle
export const ICON: Record<TownTheme, number> = { village: 0, port: 1, snow: 2, desert: 3, volcano: 4 };
// Places for towns in each region (fractions of the map); the first is also where a bundle sits.
const SLOTS: Record<TownTheme, [number, number][]> = {
  village: [[0.47, 0.5], [0.36, 0.42], [0.6, 0.6], [0.56, 0.36]],
  port: [[0.16, 0.55], [0.1, 0.38], [0.22, 0.7], [0.08, 0.66]],
  snow: [[0.5, 0.17], [0.35, 0.2], [0.65, 0.22], [0.42, 0.28]],
  desert: [[0.48, 0.84], [0.33, 0.78], [0.62, 0.8], [0.55, 0.92]],
  volcano: [[0.83, 0.42], [0.88, 0.58], [0.78, 0.3], [0.75, 0.55]],
};

export interface Marker { x: number; y: number; theme: TownTheme; projects: Project[] }

export const active = (p: Project) => p.heroes > 0 && p.theme !== undefined;
export const sleeping = () => PROJECTS.filter((p) => p.heroes === 0 && p.theme);

// One marker per town, or one per crowded region.
export function markers(w: number, h: number): Marker[] {
  const result: Marker[] = [];
  for (const theme of Object.keys(SLOTS) as TownTheme[]) {
    const towns = PROJECTS.filter((p) => active(p) && p.theme === theme);
    if (towns.length >= BUNDLE_AT) {
      const [fx, fy] = SLOTS[theme][0];
      result.push({ x: Math.round(fx * w), y: Math.round(fy * h), theme, projects: towns });
      continue;
    }
    towns.forEach((p, i) => {
      const [fx, fy] = SLOTS[theme][i % SLOTS[theme].length];
      result.push({ x: Math.round(fx * w), y: Math.round(fy * h), theme, projects: [p] });
    });
  }
  return result;
}

// A name plate: dark box with a light frame, so names stay readable on any terrain.
export function plate(ctx: CanvasRenderingContext2D, lines: [string, string, number][], x: number, y: number): { x: number; y: number; w: number; h: number } {
  ctx.textAlign = "center";
  let width = 0;
  for (const [text, , size] of lines) {
    ctx.font = `${size}px "DotGothic16", monospace`;
    width = Math.max(width, ctx.measureText(text).width);
  }
  const height = lines.reduce((sum, [, , size]) => sum + size + 3, 4);
  const left = Math.round(x - width / 2 - 6), box = Math.round(width + 12);
  ctx.fillStyle = "rgba(10, 10, 26, 0.86)";
  ctx.fillRect(left, y, box, height);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.strokeRect(left + 0.5, y + 0.5, box - 1, height - 1);
  let line = y + 2;
  for (const [text, color, size] of lines) {
    ctx.font = `${size}px "DotGothic16", monospace`;
    ctx.fillStyle = color;
    ctx.fillText(text, x, line + size);
    line += size + 3;
  }
  return { x: left, y, w: box, h: height };
}

const sum = (ps: Project[], key: "heroes" | "fighting" | "unread") => ps.reduce((n, p) => n + p[key], 0);

export function regionName(theme: TownTheme): string {
  return { village: "草原の村", port: "港町", snow: "雪国", desert: "砂漠", volcano: "火山" }[theme];
}

// Draws the map; returns the box of the "sleeping towns" plate so it can be clicked.
export function drawWorld(ctx: CanvasRenderingContext2D, art: Sheets, t: number, w: number, h: number): { x: number; y: number; w: number; h: number } {
  art.draw(ctx, "world-map", 0, w / 2, h);
  ctx.fillStyle = "rgba(10, 10, 26, 0.18)"; // soften the terrain so towns and plates stand out
  ctx.fillRect(0, 0, w, h);
  for (const marker of markers(w, h)) {
    const { x, y, projects } = marker;
    const bundle = projects.length > 1;
    const rx = bundle ? 28 : 20;
    ctx.fillStyle = "rgba(255, 246, 200, 0.35)";
    ctx.beginPath(); ctx.ellipse(x, y + 7, rx, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(x, y + 7, rx, 7, 0, 0, Math.PI * 2); ctx.stroke();
    if (bundle) {
      // A bundle: a few town icons huddled together, with the region's count on the plate.
      art.draw(ctx, "world-towns", ICON[marker.theme], x - 10, y + 4);
      art.draw(ctx, "world-towns", ICON[marker.theme], x + 10, y + 5);
      art.draw(ctx, "world-towns", ICON[marker.theme], x, y + 10);
    } else {
      art.draw(ctx, "world-towns", ICON[marker.theme], x, y + 8);
    }
    const fighting = sum(projects, "fighting"), unread = sum(projects, "unread");
    const badges = [`👤${sum(projects, "heroes")}`, fighting ? `⚔️${fighting}` : "", unread ? `📜${unread}` : ""].filter(Boolean).join("  ");
    const title = bundle ? `${regionName(marker.theme)} ×${projects.length}` : projects[0].repo;
    plate(ctx, [[title, "#ffffff", 10], [badges, "#ffe7a3", 8]], x, y + 14);
    if (projects.some((p) => p.calling)) art.draw(ctx, "ui-balloons", 0, x + 16, y - 22 - (Math.floor(t / 400) % 2));
  }
  plate(ctx, [["ワールドマップ", "#fff7d6", 12]], w / 2, 6);
  return plate(ctx, [[`💤 ねむっている町 ${sleeping().length}`, "#c9c3dc", 9]], w - 72, h - 24);
}
