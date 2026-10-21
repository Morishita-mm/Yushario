import { tr } from "../language";
import { label, overflowPlate, placeTitle } from "./field";
import type { Sheets } from "./sheets";
import { weaponBesideLabel } from "./weapon";
import { TOWN_H, TOWN_W } from "./town";
import { drawNoticeHero, type NoticeMarkFrame } from "./notice-mark";

type Shopper = { id: string; name: string; variant: number; weaponTier?: number; branch?: string };
// The painted room is drawn at a larger scale than the map sprites; the counter dwarfed 1x people.
export const SHOP_SCALE = 1.7;
export const SHOPKEEPER_LINES = [
  tr("いらっしゃい！ ゆうしゃが どうぐを つかうとき、ここへ しなさだめに きますよ。", "Welcome! Heroes stop by when they use their tools."),
  tr("ポーションも ほうぐも ならんでます。ゆっくり みていってね。", "Potions and gear, all on display. Take your time."),
  tr("きょうも ゆうしゃが ぼうけんの じゅんびを していますよ。", "Another day of heroes getting ready for adventure."),
] as const;
// The keeper's clickable body, scaled around the feet.
export const shopkeeperBox = (art: Sheets) => {
  const { x, y, w, h } = art.entry("bg-shop").shop!.npc, k = SHOP_SCALE;
  return { x: x + w / 2 - (w * k) / 2, y: y + h - h * k, w: w * k, h: h * k };
};
export const shopSlots = (art: Sheets) => art.entry("bg-shop").shop!.slots;

export function drawShop(ctx: CanvasRenderingContext2D, art: Sheets, t: number, shoppers: Shopper[], notice?: NoticeMarkFrame, town?: string): void {
  const room = art.entry("bg-shop").shop!, npc = room.npc;
  art.draw(ctx, "bg-shop", "backdrop", TOWN_W / 2, TOWN_H);
  // The counter is already painted; the keeper stands on the clear floor beside it, never on its top.
  art.draw(ctx, "npc-shopkeeper", art.pose("npc-shopkeeper", "idle", t % 4500 > 4220 ? 1 : 0), npc.x + npc.w / 2, npc.y + npc.h, false, SHOP_SCALE);
  label(ctx, tr("どうぐやの てんしゅ", "SHOPKEEPER"), npc.x + npc.w / 2, npc.y + npc.h + 14);
  shoppers.slice(0, room.slots.length).forEach((hero, i) => {
    const [x, y] = room.slots[i], [lx, ly] = room.label;
    drawNoticeHero(ctx, art, art.variant("hero-shop-browse", hero.variant), art.pose("hero-shop-browse", "browse", Math.floor((t + i * 180) / 700)), x, y, notice?.id === hero.id ? notice : undefined, false, SHOP_SCALE);
    label(ctx, hero.name, x + lx, y + ly);
    if (hero.branch) label(ctx, hero.branch, x + lx, y + ly + 12, "#9fd3ff", 8, "branch");
    weaponBesideLabel(ctx, art, hero.weaponTier, t, hero.name, x + lx, y + ly);
  });
  placeTitle(ctx, tr("どうぐや（なか）", "ITEM SHOP"), TOWN_W / 2, 8, town);
  overflowPlate(ctx, shoppers.length - room.slots.length, TOWN_W);
}
