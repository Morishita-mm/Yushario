import { tr } from "../language";
import { label, placeTitle } from "./field";
import type { Sheets } from "./sheets";
import { weaponBesideLabel } from "./weapon";
import { TOWN_H, TOWN_W } from "./town";
import { drawNoticeHero, type NoticeMarkFrame } from "./notice-mark";

// Read the same art placements for drawing, commands and report signs.
export const churchSlots = (art: Sheets) => art.entry("bg-church").church!.slots;
export const churchPriest = (art: Sheets) => art.entry("bg-church").church!.priest;
export const PRIEST_LINES = [
  tr("よく きましたね。こころを しずめて おいのりなさい。", "Welcome. Quiet your heart and pray."),
  tr("たびの あいだにも ひとやすみは たいせつですよ。", "Every traveler needs a little rest."),
  tr("MPが へってきたら ここで いのりなさい。", "Low on MP? Offer a prayer here."),
  tr("ひとやすみは 勇者の「やすむ」から。", "Choose Rest, brave hero."),
] as const;
type Prayer = { id?: string; name: string; variant: number; weaponTier?: number };

export function drawChurch(ctx: CanvasRenderingContext2D, art: Sheets, t: number, prayers: Prayer[], notice?: NoticeMarkFrame, town?: string): void {
  const room = art.entry("bg-church").church!;
  art.draw(ctx, "bg-church", "backdrop", TOWN_W / 2, TOWN_H);
  const priest = room.priest;
  art.draw(ctx, "church-priest", art.pose("church-priest", "idle", Math.floor(t / 360) % 2), priest.x + priest.w / 2, priest.y + priest.h);
  label(ctx, tr("神父さま", "PRIEST"), priest.x + priest.w / 2, priest.y + priest.h + 14);
  prayers.slice(0, room.slots.length).forEach((prayer, i) => {
    const [x, y] = room.slots[i], [lx, ly] = room.labels[i % 2];
    drawNoticeHero(ctx, art, art.variant("hero-pray", prayer.variant), art.pose("hero-pray", "prayer", Math.floor((t + i * 120) / 360) % 2), x, y, notice?.id === prayer.id ? notice : undefined);
    art.draw(ctx, "ui-prayer-balloon", "praying hands", x + room.balloon[0], y + room.balloon[1] + (Math.floor((t + i * 400) / 500) % 2));
    label(ctx, prayer.name, x + lx, y + ly);
    weaponBesideLabel(ctx, art, prayer.weaponTier, t, prayer.name, x + lx, y + ly);
  });
  placeTitle(ctx, tr("きょうかい（なか）", "CHURCH"), TOWN_W / 2, 8, town);
  if (prayers.length > room.slots.length) label(ctx, tr(`ほか ${prayers.length - room.slots.length}人`, `${prayers.length - room.slots.length} more`), 680, 490, "#ffe066", 14);
}
