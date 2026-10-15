import type { Sheets } from "./sheets";

// Shared-colour hero PNGs cannot isolate the blade, so use the specified nameplate icon.
export function drawWeapon(ctx: CanvasRenderingContext2D, art: Sheets, tier: number | undefined,
  t: number, x: number, y: number): void {
  if (!tier || tier < 1) return;
  art.draw(ctx, "ui-weapons", art.pose("ui-weapons", "tiers", Math.min(3, tier) - 1), x, y);
  if (tier < 3 || (t + x * 17) % 5200 > 220) return;
  ctx.save();
  ctx.fillStyle = "#fff7d6";
  const [, h] = art.size("ui-weapons");
  ctx.fillRect(Math.round(x) - 2, Math.round(y - h / 2), 5, 1);
  ctx.fillRect(Math.round(x), Math.round(y - h / 2) - 2, 1, 5);
  ctx.restore();
}

export function weaponBesideLabel(ctx: CanvasRenderingContext2D, art: Sheets, tier: number | undefined,
  t: number, name: string, x: number, y: number): void {
  drawWeapon(ctx, art, tier, t, x + Math.min(160, ctx.measureText(name).width) / 2 + art.size("ui-weapons")[0] / 2 + 3, y + 2);
}
