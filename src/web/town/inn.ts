import { label } from "./field";
import type { Sheets } from "./sheets";
import { weaponBesideLabel } from "./weapon";
import { TOWN_H, TOWN_W } from "./town";
import { drawNoticeHero, type NoticeMarkFrame } from "./notice-mark";

export const innSlots = (art: Sheets) => art.entry("inn-wall").inn!.slots;

// Inside the inn: placements are shared by drawing, commands and report signs.
export function drawInn(ctx: CanvasRenderingContext2D, art: Sheets, t: number, sleepers: (string | { id?: string; name: string; weaponTier?: number })[], notice?: NoticeMarkFrame): void {
  const room = art.entry("inn-wall").inn!, floor = room.floor;
  ctx.fillStyle = "#1d1726";
  ctx.fillRect(0, 0, TOWN_W, TOWN_H);
  const [ww] = art.size("inn-wall");
  const width = ww * room.wallCopies, left = Math.round((TOWN_W - width) / 2);
  ctx.fillStyle = floor.base;
  ctx.fillRect(left, room.floorTop, width, room.floorBottom - room.floorTop);
  for (let y = room.floorTop, row = 0; y < room.floorBottom; y += floor.row, row++) {
    ctx.fillStyle = floor.joint; ctx.fillRect(left, y, width, 1);
    ctx.fillStyle = floor.highlight; ctx.fillRect(left, y + 1, width, 1);
    ctx.fillStyle = floor.joint;
    for (let x = left + ((row * floor.stagger) % floor.spacing); x < left + width; x += floor.spacing) ctx.fillRect(x, y + 1, 1, floor.row - 1);
  }
  for (let i = 0; i < room.wallCopies; i++) art.draw(ctx, "inn-wall", "wall", left + ww * i + ww / 2, room.wallBottom);
  art.draw(ctx, "inn-rug", "rug", ...room.rug);
  room.slots.forEach(([x, y], i) => {
    const sleeper = sleepers[i];
    const name = typeof sleeper === "string" ? sleeper : sleeper?.name;
    const mark = typeof sleeper !== "string" && sleeper?.id === notice?.id ? notice : undefined;
    drawNoticeHero(ctx, art, name ? "hero-sleep" : "inn-bed", name ? "sleeping" : "bed", x, y, mark);
    if (name) {
      art.draw(ctx, "ui-balloons", "sleep Zz", x + room.balloon[0], y + room.balloon[1] + (Math.floor((t + i * 400) / 500) % 2));
      label(ctx, name, x, y + 14);
      weaponBesideLabel(ctx, art, typeof sleeper === "string" ? undefined : sleeper.weaponTier, t, name, x, y + 14);
    }
  });
  label(ctx, "やどや（なか）", TOWN_W / 2, 120, "#fff7d6", 16);
  if (sleepers.length > room.slots.length) label(ctx, `ほか ${sleepers.length - room.slots.length}人`, TOWN_W / 2, 430, "#ffe066", 14);
}
