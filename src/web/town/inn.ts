import { tr } from "../language";
import { label, placeTitle } from "./field";
import type { Sheets } from "./sheets";
import { heroVariant } from "./appearance";
import { weaponBesideLabel } from "./weapon";
import { TOWN_H, TOWN_W } from "./town";
import { drawNoticeHero, type NoticeMarkFrame } from "./notice-mark";

export const innSlots = (art: Sheets) => art.entry("bg-inn").inn!.slots;

// Each slot owns one complete bed sprite, including the sleeper when occupied.
export function drawInn(ctx: CanvasRenderingContext2D, art: Sheets, t: number, sleepers: { id: string; name: string; weaponTier?: number }[], notice?: NoticeMarkFrame, town?: string): void {
  const room = art.entry("bg-inn").inn!;
  art.draw(ctx, "bg-inn", "backdrop", TOWN_W / 2, TOWN_H);
  room.slots.forEach(([x, y], i) => {
    const sleeper = sleepers[i];
    if (!sleeper) { art.draw(ctx, "inn-bed-interior", "empty", x, y); return; }
    const [lx, ly] = room.label;
    drawNoticeHero(ctx, art, art.variant("hero-sleep-bed-interior", heroVariant(sleeper.id)), "sleeping", x, y, sleeper.id === notice?.id ? notice : undefined);
    art.draw(ctx, "ui-balloons", "sleep Zz", x + room.balloon[0], y + room.balloon[1] + (Math.floor((t + i * 400) / 500) % 2));
    label(ctx, sleeper.name, x + lx, y + ly);
    weaponBesideLabel(ctx, art, sleeper.weaponTier, t, sleeper.name, x + lx, y + ly);
  });
  placeTitle(ctx, tr("やどや（なか）", "INN"), TOWN_W / 2, 8, town);
  if (sleepers.length > room.slots.length) label(ctx, tr(`ほか ${sleepers.length - room.slots.length}人`, `${sleepers.length - room.slots.length} more`), TOWN_W / 2, 430, "#ffe066", 14);
}
