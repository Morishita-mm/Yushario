import type { Ambient, Theme } from "./ambient";
import type { Sheets } from "./sheets";

// The focused battle view. Demo data may opt into the original staged battle loop.
export type Focus = {
  backdrop: string; theme: Theme; monster: string; enemyFx: number; name: string; party: string[];
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

function line(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size = 8, color = "#ffffff", align: CanvasTextAlign = "left"): void {
  ctx.font = `${size}px "DotGothic16", monospace`;
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

export function drawFocus(ctx: CanvasRenderingContext2D, art: Sheets, focus: Focus, ambient: Ambient, t: number, dt: number, W: number, H: number): void {
  const c = t % LOOP;
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
      art.draw(ctx, `${focus.monster}-attack`, frame, mx, my + (frame === 1 ? 8 : 0));
    } else {
      const hit = (c > 1100 && c < 1600) || (c > 2800 && c < 3300);
      art.draw(ctx, focus.monster, hit ? 2 : Math.floor(t / 450) % 2, mx + (hit ? 3 : 0), my);
      if (hit) art.draw(ctx, "fx-battle", c < 2000 ? Math.floor((c - 1100) / 170) : 3 + Math.floor((c - 2800) / 170), mx, my - 20);
      if (hit && focus.damage) line(ctx, String(c < 2000 ? focus.damage.hero : focus.damage.party), mx, my - 40 - (c % 500) / 40, 12, "#ffffff", "center");
    }
  } else if (c < 7300) {
    art.draw(ctx, "fx-battle", 6 + Math.floor((c - 6600) / 240), mx, my - 10);
  }
  // Party, seen from behind, standing in front of the window.
  const slots = focus.party.map((id, i) => ({ id, x: W / 2 + (i - (focus.party.length - 1) / 2) * 64, y: H - 44 }));
  for (const slot of slots) {
    const hero = slot.id === "hero-back-battle";
    let frame = 0;
    if (hero) {
      if (c > 500 && c < 1100) frame = 1;
      else if (c >= 1100 && c < 1600) frame = 2;
      else if (counter && c > 4800 && c < 5800) frame = 4;
      else if (victory) frame = 5;
    } else {
      if (c > 2300 && c < 2800) frame = 1;
      else if (c >= 2800 && c < 3300) frame = 2;
      else if (counter && c > 4800 && c < 5800) frame = 3;
    }
    const lift = !counter && !victory ? Math.floor((t + slot.x * 7) / 400) % 2 : 0;
    art.draw(ctx, hero ? art.variant(slot.id, focus.variant ?? 0) : slot.id, frame, slot.x, slot.y + (frame === 4 ? 4 : 0) - lift);
    if (hero && counter && c > 4800 && c < 5400) art.draw(ctx, "fx-enemy", focus.enemyFx + (Math.floor(c / 120) % 2), slot.x, slot.y - 30);
    if (hero && counter && c > 4850 && focus.damage) line(ctx, `-${focus.damage.enemy}`, slot.x, slot.y - 70 - Math.min(10, (c - 4850) / 30), 12, "#ff6b5b", "center");
  }
  ambient.drawFront(ctx, t, dt);
  ctx.restore();
  if (counter && c > 4700 && c < 4850) { ctx.fillStyle = "rgba(255, 60, 60, 0.35)"; ctx.fillRect(0, 0, W, H); }
  // Windows: status on top, story at the bottom.
  focus.status.forEach((status, i) => {
    const w = 84, x = 8 + i * (w + 6);
    windowBox(ctx, x, 6, w, 34);
    line(ctx, status.name, x + 8, 19, 8);
    const values = status.hp === undefined ? "なかま" : `HP ${Math.round(status.hp * 100)}  MP ${Math.round((status.mp ?? 1) * 100)}`;
    line(ctx, values, x + 8, 32, 7, "#c9c3dc");
  });
  windowBox(ctx, 6, H - 46, W - 12, 40);
  focus.message.split("\n").forEach((row, i) => line(ctx, row, 16, H - 28 + i * 14, 10));
}
