import { tr } from "../language";
import { label, overflowPlate, placeTitle } from "./field";
import type { Sheets } from "./sheets";
import type { Point } from "./art-data";
import { weaponBesideLabel } from "./weapon";
import { TOWN_H, TOWN_W } from "./town";
import { drawNoticeHero, type NoticeMarkFrame } from "./notice-mark";

// Like the shop, the painted room is larger than the map sprites, so people are drawn bigger.
export const LIBRARY_SCALE = 1.5;
export const LIBRARIAN_LINES = [
  tr("しーっ。ここは としょかん。しずかに おねがいしますね。", "Shh. This is a library. Quietly, please."),
  tr("ファイルを よむ ゆうしゃは つくえで、さがす ゆうしゃは ほんだなの まえに いますよ。", "Heroes who read sit at the desks; those who search stand at the shelves."),
  tr("さがしものですか？ ゆうしゃが ほんだなを しらべています。", "Looking for something? The heroes are searching the shelves."),
] as const;
// The librarian's clickable body, scaled around her feet.
export const librarianBox = (art: Sheets) => {
  const { x, y, w, h } = art.entry("bg-library").library!.npc, k = LIBRARY_SCALE;
  return { x: x + w / 2 - (w * k) / 2, y: y + h - h * k, w: w * k, h: h * k };
};
type Reader = { id: string; name: string; variant: number; search?: boolean; weaponTier?: number; branch?: string };

// Keep reading/searching in separate furniture-safe rows; drawing, clicks and reports use the same allocation.
export function libraryPositions(art: Sheets, searching: readonly boolean[]): (Point | undefined)[] {
  const slots = art.entry("bg-library").library!.slots;
  let read = 0, search = 0;
  return searching.map((active) => active ? slots.search[search++] : slots.read[read++]);
}

export function drawLibrary(ctx: CanvasRenderingContext2D, art: Sheets, t: number, readers: Reader[], notice?: NoticeMarkFrame, town?: string): void {
  const room = art.entry("bg-library").library!, npc = room.npc;
  art.draw(ctx, "bg-library", "backdrop", TOWN_W / 2, TOWN_H);
  art.draw(ctx, "npc-librarian", art.pose("npc-librarian", "idle", t % 4000 > 3740 ? 1 : 0), npc.x + npc.w / 2, npc.y + npc.h, false, LIBRARY_SCALE);
  label(ctx, tr("ししょ", "LIBRARIAN"), npc.x + npc.w / 2, npc.y + npc.h + 14);
  const positions = libraryPositions(art, readers.map((hero) => Boolean(hero.search)));
  const seated = readers.flatMap((hero, i) => positions[i] ? [{ hero, point: positions[i]! }] : []);
  for (const { hero, point: [x, y] } of seated.sort((a, b) => a.point[1] - b.point[1])) {
    const sheet = hero.search ? "hero-library-search" : "hero-library-read", sequence = hero.search ? "search" : "read";
    const [lx, ly] = room.label;
    drawNoticeHero(ctx, art, art.variant(sheet, hero.variant), art.pose(sheet, sequence, Math.floor((t + hero.variant * 180) / 750)), x, y, notice?.id === hero.id ? notice : undefined, false, LIBRARY_SCALE);
    label(ctx, hero.name, x + lx, y + ly);
    if (hero.branch) label(ctx, hero.branch, x + lx, y + ly + 12, "#9fd3ff", 8, "branch");
    weaponBesideLabel(ctx, art, hero.weaponTier, t, hero.name, x + lx, y + ly);
  }
  placeTitle(ctx, tr("としょかん（なか）", "LIBRARY"), TOWN_W / 2, 8, town);
  overflowPlate(ctx, readers.length - seated.length, TOWN_W);
}
