import { label } from "./field";
import type { Sheets } from "./sheets";
import { TOWN_H, TOWN_W } from "./town";

// Inside the inn: beds of one size, dozing agents tucked in.
export function drawInn(ctx: CanvasRenderingContext2D, art: Sheets, t: number, sleepers: string[]): void {
  ctx.fillStyle = "#1d1726";
  ctx.fillRect(0, 0, TOWN_W, TOWN_H);
  const [ww] = art.size("inn-wall");
  const left = Math.round((TOWN_W - ww * 3) / 2), width = ww * 3;
  // Plank floor drawn directly (palette browns): rows of boards with staggered joints.
  ctx.fillStyle = "#9e4539";
  ctx.fillRect(left, 150, width, 350);
  for (let y = 150, row = 0; y < 500; y += 7, row++) {
    ctx.fillStyle = "#7a3045"; ctx.fillRect(left, y, width, 1);
    ctx.fillStyle = "#cd683d"; ctx.fillRect(left, y + 1, width, 1);
    ctx.fillStyle = "#7a3045";
    for (let x = left + ((row * 37) % 60); x < left + width; x += 60) ctx.fillRect(x, y + 1, 1, 6);
  }
  for (let i = 0; i < 3; i++) art.draw(ctx, "inn-wall", 0, left + ww * i + ww / 2, 190);
  art.draw(ctx, "inn-rug", 0, 480, 480);
  for (let i = 0; i < 6; i++) {
    const x = 200 + i * 112, y = 360;
    const name = sleepers[i];
    art.draw(ctx, name ? "hero-sleep" : "inn-bed", 0, x, y);
    if (name) {
      art.draw(ctx, "ui-balloons", 2, x + 20, y - 72 + (Math.floor((t + i * 400) / 500) % 2));
      label(ctx, name, x, y + 14);
    }
  }
  label(ctx, "やどや（なか）", TOWN_W / 2, 120, "#fff7d6", 16);
  if (sleepers.length > 6) label(ctx, `ほか ${sleepers.length - 6}人`, TOWN_W / 2, 430, "#ffe066", 14);
}
