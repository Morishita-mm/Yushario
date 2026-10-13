import { label, placeTitle } from "./field";
import type { Sheets } from "./sheets";
import { weaponBesideLabel } from "./weapon";
import { TOWN_H, TOWN_W } from "./town";
import { drawNoticeHero, type NoticeMarkFrame } from "./notice-mark";

// Read the same art placements for drawing, commands and report signs.
export const churchSlots = (art: Sheets) => art.entry("church-wall").church!.slots;
export const churchPriest = (art: Sheets) => art.entry("church-wall").church!.priest;
export const PRIEST_LINES = [
  "よく きましたね。こころを しずめて おいのりなさい。",
  "たびの あいだにも ひとやすみは たいせつですよ。",
  "MPが へってきたら ここで いのりなさい。",
  "ひとやすみは 勇者の「やすむ」から。",
] as const;
type Prayer = { id?: string; name: string; variant: number; weaponTier?: number };

export function drawChurch(ctx: CanvasRenderingContext2D, art: Sheets, t: number, prayers: Prayer[], notice?: NoticeMarkFrame, town?: string): void {
  const room = art.entry("church-wall").church!, floor = room.floor;
  ctx.fillStyle = "#1d1726";
  ctx.fillRect(0, 0, TOWN_W, TOWN_H);
  const [ww, wh] = art.size("church-wall");
  const width = ww * room.wallCopies, left = Math.round((TOWN_W - width) / 2);
  const wallBottom = room.wallTop + wh;
  ctx.fillStyle = floor.base;
  ctx.fillRect(left, wallBottom, width, room.floorBottom - wallBottom);
  for (let y = wallBottom, row = 0; y < room.floorBottom; y += floor.row, row++) {
    ctx.fillStyle = floor.joint; ctx.fillRect(left, y, width, 1);
    ctx.fillStyle = floor.highlight; ctx.fillRect(left, y + 1, width, 1);
    ctx.fillStyle = floor.joint;
    for (let x = left + (row % 2) * floor.stagger; x < left + width; x += floor.spacing) ctx.fillRect(x, y + 1, 1, Math.min(floor.row - 1, room.floorBottom - 1 - y));
  }
  const [fx, fy] = art.entry("church-wall").foot;
  for (let i = 0; i < room.wallCopies; i++) art.draw(ctx, "church-wall", "wall", left + ww * i + fx, room.wallTop + fy);
  const [, rugH] = art.size("church-rug");
  if (rugH > 0) {
    const repeats = Math.max(1, Math.ceil((room.rug.bottom - room.rug.top) / rugH) - 2), top = room.rug.bottom - rugH * (repeats + 2);
    art.draw(ctx, "church-rug", "far end (top border)", room.rug.x, top + rugH);
    for (let i = 0; i < repeats; i++) art.draw(ctx, "church-rug", "seamless middle (no horizontal border)", room.rug.x, top + rugH * (i + 2));
    art.draw(ctx, "church-rug", "near end (bottom border)", room.rug.x, top + rugH * (repeats + 2));
  }
  art.draw(ctx, "church-altar", "altar", ...room.altar);
  for (const point of room.candles) art.draw(ctx, "church-candles", "candles", ...point);
  const priest = room.priest;
  art.draw(ctx, "church-priest", art.pose("church-priest", "idle", Math.floor(t / 360) % 2), priest.x + priest.w / 2, priest.y + priest.h);
  label(ctx, "神父さま", priest.x + priest.w / 2, priest.y + priest.h + 14);
  for (const point of room.pews) art.draw(ctx, "church-pew", "pew", ...point);
  const [, prayerH] = art.entry("hero-pray").foot;
  prayers.slice(0, room.slots.length).forEach((prayer, i) => {
    const [x, y] = room.slots[i];
    drawNoticeHero(ctx, art, art.variant("hero-pray", prayer.variant), art.pose("hero-pray", "prayer", Math.floor((t + i * 120) / 360) % 2), x, y, notice?.id === prayer.id ? notice : undefined);
    art.draw(ctx, "ui-prayer-balloon", "praying hands", x + 20, y - prayerH - 4 + (Math.floor((t + i * 400) / 500) % 2));
    label(ctx, prayer.name, x, y + 14);
    weaponBesideLabel(ctx, art, prayer.weaponTier, t, prayer.name, x, y + 14);
  });
  placeTitle(ctx, "きょうかい（なか）", TOWN_W / 2, 78, town);
  if (prayers.length > room.slots.length) label(ctx, `ほか ${prayers.length - room.slots.length}人`, TOWN_W / 2, 430, "#ffe066", 14);
}
