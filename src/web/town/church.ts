import { label } from "./field";
import type { Sheets } from "./sheets";
import { TOWN_H, TOWN_W } from "./town";

// Shared positions for drawing, commands and report signs, like the inn's six beds.
export const CHURCH_SLOTS: readonly [number, number][] = [
  [480, 300], [368, 300], [592, 300], [480, 380], [368, 380], [592, 380],
];
export const CHURCH_PRIEST = { x: 626, y: 205, w: 48, h: 70 };
export const PRIEST_LINES = [
  "よく きましたね。こころを しずめて おいのりなさい。",
  "たびの あいだにも ひとやすみは たいせつですよ。",
  "MPが へってきたら ここで いのりなさい。",
  "ゆうしゃの「やすむ」で おはなしを せいりできますよ。",
] as const;
type Prayer = { name: string; variant: number };

export function drawChurch(ctx: CanvasRenderingContext2D, art: Sheets, t: number, prayers: Prayer[]): void {
  ctx.fillStyle = "#1d1726";
  ctx.fillRect(0, 0, TOWN_W, TOWN_H);
  const [ww, wh] = art.size("church-wall");
  const width = ww * 3, left = Math.round((TOWN_W - width) / 2);
  const wallBottom = 126 + wh;
  // The taller wall starts below the title; its solid dado meets the stone floor.
  ctx.fillStyle = "#8b9bb4";
  ctx.fillRect(left, wallBottom, width, 500 - wallBottom);
  for (let y = wallBottom, row = 0; y < 500; y += 18, row++) {
    ctx.fillStyle = "#5a6988"; ctx.fillRect(left, y, width, 1);
    ctx.fillStyle = "#c0cbdc"; ctx.fillRect(left, y + 1, width, 1);
    ctx.fillStyle = "#5a6988";
    for (let x = left + (row % 2) * 24; x < left + width; x += 48) ctx.fillRect(x, y + 1, 1, Math.min(17, 499 - y));
  }
  for (let i = 0; i < 3; i++) art.draw(ctx, "church-wall", 0, left + ww * i + ww / 2, wallBottom);
  // The sheet is top cap / seamless middle / bottom cap; use its exact cell height with no gaps.
  const [, rugH] = art.size("church-rug");
  if (rugH > 0) {
    const repeats = Math.max(1, Math.ceil((500 - 230) / rugH) - 2), top = 500 - rugH * (repeats + 2);
    art.draw(ctx, "church-rug", 0, 480, top + rugH);
    for (let i = 0; i < repeats; i++) art.draw(ctx, "church-rug", 1, 480, top + rugH * (i + 2));
    art.draw(ctx, "church-rug", 2, 480, top + rugH * (repeats + 2));
  }
  art.draw(ctx, "church-altar", 0, 480, 230);
  for (const x of [410, 550]) art.draw(ctx, "church-candles", 0, x, 230);
  const priest = CHURCH_PRIEST;
  art.draw(ctx, "church-priest", Math.floor(t / 360) % 2, priest.x + priest.w / 2, priest.y + priest.h);
  label(ctx, "神父さま", priest.x + priest.w / 2, priest.y + priest.h + 14);
  for (const y of [320, 400, 470]) for (const x of [220, 740]) art.draw(ctx, "church-pew", 0, x, y);
  const [, prayerH] = art.size("hero-pray");
  prayers.slice(0, CHURCH_SLOTS.length).forEach((prayer, i) => {
    const [x, y] = CHURCH_SLOTS[i];
    art.draw(ctx, art.variant("hero-pray", prayer.variant), Math.floor((t + i * 120) / 360) % 2, x, y);
    art.draw(ctx, "ui-prayer-balloon", 0, x + 20, y - prayerH - 4 + (Math.floor((t + i * 400) / 500) % 2));
    label(ctx, prayer.name, x, y + 14);
  });
  label(ctx, "きょうかい（なか）", TOWN_W / 2, 100, "#fff7d6", 16);
  if (prayers.length > CHURCH_SLOTS.length) label(ctx, `ほか ${prayers.length - CHURCH_SLOTS.length}人`, TOWN_W / 2, 430, "#ffe066", 14);
}
