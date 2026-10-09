import type { Job, MonsterKind } from "../../core/story";
import { MONSTERS, monsterFrame } from "./art/monsters";
import { frame, palette, type Pose } from "./art/people";
import type { Grid, Palette } from "./art/pixel";

// Grids are painted once into small canvases (1 px per pixel) and drawn scaled without smoothing.
const cache = new Map<string, HTMLCanvasElement>();

export function paint(key: string, grid: Grid, colors: Palette): HTMLCanvasElement {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(...grid.map((row) => row.length));
  canvas.height = grid.length;
  const ctx = canvas.getContext("2d")!;
  grid.forEach((row, y) => [...row].forEach((pixel, x) => {
    if (pixel === ".") return;
    ctx.fillStyle = colors[pixel] ?? "#ff00ff";
    ctx.fillRect(x, y, 1, 1);
  }));
  cache.set(key, canvas);
  return canvas;
}

// A white or coloured silhouette, used for hit flashes.
export function silhouette(source: HTMLCanvasElement, key: string, color: string): HTMLCanvasElement {
  const id = `${key}:${color}`;
  const hit = cache.get(id);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(source, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  cache.set(id, canvas);
  return canvas;
}

// Each agent's hero gets its own hair / clothes / cape colours.
const HERO_COLORS = [
  { h: "#6a3d22", a: "#3f6fd8", c: "#d8413f" },
  { h: "#e2b84a", a: "#3e9a5a", c: "#2f58b8" },
  { h: "#2b2633", a: "#c0393b", c: "#e6b63a" },
  { h: "#c9ccd6", a: "#7b4bc4", c: "#2e9c97" },
  { h: "#c4532f", a: "#2e8f8f", c: "#8a3fb0" },
  { h: "#3a5ab8", a: "#e07b2e", c: "#2c3e6e" },
  { h: "#8a5a2b", a: "#d24f86", c: "#f0f0f0" },
  { h: "#f0e4c8", a: "#4a6a3a", c: "#a23a2a" },
];

export function heroColors(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % HERO_COLORS.length;
}

export function heroAccent(id: string): string {
  return HERO_COLORS[heroColors(id)].a;
}

export function person(job: Job, pose: Pose, colorIndex = 0): HTMLCanvasElement {
  const key = `${job}:${pose}:${job === "hero" ? colorIndex : 0}`;
  return paint(key, frame(job, pose), palette(job, job === "hero" ? HERO_COLORS[colorIndex] : {}));
}

export function monster(kind: MonsterKind, beat: 0 | 1): HTMLCanvasElement {
  return paint(`monster:${kind}:${beat}`, monsterFrame(kind, beat), MONSTERS[kind].palette);
}
