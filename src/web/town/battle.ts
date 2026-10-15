import { tr } from "../language";
import { battlePresentation, type EquipmentTiers } from "../../core/battle-presentation";
import { drawWeapon } from "./weapon";
import type { Ambient, Theme } from "./ambient";
import type { Sheets } from "./sheets";

// The focused battle view. Demo data may opt into the original staged battle loop.
export type Focus = EquipmentTiers & {
  success?: boolean;
  backdrop: string; theme: Theme; monster: string; enemyFx: string; name: string; party: string[];
  variant?: number; demo?: boolean; counter?: boolean; message: string;
  status: { name: string; hp?: number; mp?: number }[];
  damage?: { hero: number; party: number; enemy: number };
};

const LOOP = 9000;

function windowBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = "#0a0a1a";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
}

function line(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size = 8, color = "#ffffff", align: CanvasTextAlign = "left", maxWidth?: number): void {
  ctx.font = `${size}px "DotGothic16", monospace`;
  if (maxWidth !== undefined && ctx.measureText(value).width > maxWidth) {
    const letters = Array.from(value);
    let low = 0, high = letters.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (ctx.measureText(`${letters.slice(0, mid).join("")}…`).width <= maxWidth) low = mid;
      else high = mid - 1;
    }
    value = `${letters.slice(0, low).join("")}…`;
  }
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

export function drawFocus(ctx: CanvasRenderingContext2D, art: Sheets, focus: Focus, ambient: Ambient, t: number, dt: number, W: number, H: number): void {
  const c = t % LOOP;
  const effects = battlePresentation(focus, focus.demo ? true : focus.success, Math.floor(t / LOOP), focus.damage?.hero ?? 23);
  const strikeAt = 500 + effects.windup;
  const heroHit = c > strikeAt && c < strikeAt + 500;
  const counter = focus.demo ? c > 4200 && c < 6200 : Boolean(focus.counter);
  const shake = counter && c > 4700 && c < 5100 ? (Math.floor(c / 40) % 2 ? 2 : -2) : 0;
  ctx.save();
  ctx.translate(shake, 0);
  // The view is the backdrop's own size (W×H), so the backdrop is drawn 1:1, with its ambient life.
  ambient.drawBack(ctx, t);
  // Monster.
  const mx = W / 2, my = H * 0.56;
  const victory = Boolean(focus.demo && c > 6600);
  if (!victory) {
    if (counter) {
      const frame = c < 4700 ? 0 : c < 5400 ? 1 : 2;
      art.draw(ctx, `${focus.monster}-attack`, art.pose(`${focus.monster}-attack`, "attack", frame), mx, my + (frame === 1 ? 8 : 0));
    } else {
      const hit = heroHit || (c > 2800 && c < 3300);
      art.draw(ctx, focus.monster, hit ? "hurt" : art.pose(focus.monster, "idle", Math.floor(t / 450) % 2), mx + (hit ? 3 : 0), my);
      if (hit) art.draw(ctx, "fx-battle", art.pose("fx-battle", heroHit ? "slash" : "spell", Math.floor((c - (heroHit ? strikeAt : 2800)) / 170)), mx, my - 20);
      const damage = heroHit ? effects.damage : focus.damage?.party;
      if (hit && (focus.damage || focus.weaponTier) && damage !== undefined) line(ctx, String(damage), mx, my - 40 - (c % 500) / 40, 12, "#ffffff", "center");
    }
  } else if (c < 7300) {
    art.draw(ctx, "fx-battle", art.pose("fx-battle", "poof", Math.floor((c - 6600) / 240)), mx, my - 10);
  }
  // Party, seen from behind, standing in front of the window.
  const slots = focus.party.map((id, i) => ({ id, x: W / 2 + (i - (focus.party.length - 1) / 2) * art.size("hero-model")[0] * 2, y: H - 44 }));
  for (const slot of slots) {
    const hero = slot.id === "hero-back-battle";
    let frame = "ready";
    if (hero) {
      if (c > 500 && c < strikeAt) frame = "wind-up";
      else if (c >= strikeAt && c < strikeAt + 500) frame = "slash";
      else if (counter && c > 4800 && c < 5800) frame = "hurt";
      else if (victory) frame = "victory";
    } else {
      if (c > 2300 && c < 2800) frame = art.pose(slot.id, "attack", 0);
      else if (c >= 2800 && c < 3300) frame = art.pose(slot.id, "attack", 1);
      else if (counter && c > 4800 && c < 5800) frame = "hurt";
    }
    const lift = !counter && !victory ? Math.floor((t + slot.x * 7) / 400) % 2 : 0;
    art.draw(ctx, hero ? art.variant(slot.id, focus.variant ?? 0) : slot.id, frame, slot.x, slot.y + (hero && frame === "hurt" ? 4 : 0) - lift);
    if (hero && counter && c > 4800 && c < 5400) art.draw(ctx, "fx-enemy", art.pose("fx-enemy", focus.enemyFx, Math.floor(c / 120) % 2), slot.x, slot.y - 30);
    if (hero && counter && c > 4850 && focus.damage) line(ctx, `-${focus.damage.enemy}`, slot.x, slot.y - 70 - Math.min(10, (c - 4850) / 30), 12, "#ff6b5b", "center");
  }
  ambient.drawFront(ctx, t, dt);
  ctx.restore();
  if (counter && c > 4700 && c < 4850) { ctx.fillStyle = "rgba(255, 60, 60, 0.35)"; ctx.fillRect(0, 0, W, H); }
  // Windows: status on top, story at the bottom.
  focus.status.forEach((status, i) => {
    const w = 84, x = 8 + i * (w + 6);
    windowBox(ctx, x, 6, w, 34);
    const weaponSpace = i === 0 && focus.weaponTier ? art.size("ui-weapons")[0] + 2 : 0;
    line(ctx, status.name, x + 8, 19, 8, "#ffffff", "left", w - 16 - weaponSpace);
    if (i === 0) drawWeapon(ctx, art, focus.weaponTier, t, x + w - art.size("ui-weapons")[0] / 2 - 3, 23);
    const values = status.hp === undefined ? tr("なかま", "Ally") : `HP ${Math.round(status.hp * 100)}  MP ${status.mp === undefined ? "？" : Math.round(status.mp * 100)}`;
    line(ctx, values, x + 8, 32, 7, "#c9c3dc");
  });
  windowBox(ctx, 6, H - 46, W - 12, 40);
  const charging = !counter && !victory && c > 500 && c < strikeAt && effects.charging;
  const critical = !counter && heroHit && effects.critical;
  const message = charging ? tr(`ちからを ためている…\n${focus.message.split("\n")[1] ?? ""}`, `Charging…\n${focus.message.split("\n")[1] ?? ""}`)
    : critical ? tr(`かいしんの いちげき！\n${focus.name}に ${effects.damage}の ダメージ！`, `Critical hit!\n${effects.damage} damage to ${focus.name}!`) : focus.message;
  message.split("\n").forEach((row, i) => line(ctx, row, 16, H - 28 + i * 14, 10));
}
