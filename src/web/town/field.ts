import { tr } from "../language";
import { drawIcon, type IconName } from "../icons.js";
import { battlePresentation, type EquipmentTiers } from "../../core/battle-presentation";
import { weaponBesideLabel } from "./weapon";
import type { Theme } from "./ambient";
import type { Sheets } from "./sheets";
import { drawNoticeHero, type NoticeMarkFrame } from "./notice-mark";
import { plate } from "./world";

// One field map (960×540), composed from the supplied battles.
export const FIELD_W = 960;
export const FIELD_H = 540;

export type Fight = EquipmentTiers & { success?: boolean; id?: string; branch?: string; x: number; y: number; name: string; variant: number; monster: string; target: string; party: string[]; fx: string; done?: boolean; level: number; demo?: boolean; counter?: boolean; damage?: { hero: number; enemy: number } };

// A place's title plate: the project (town) name large and gold, the place small under it.
export function placeTitle(ctx: CanvasRenderingContext2D, place: string, x: number, y: number, town?: string): void {
  plate(ctx, town ? [[town, "#ffe066", 20], [place, "#fff7d6", 12]] : [[place, "#fff7d6", 16]], x, y);
}

// "N more heroes are not shown": one plate, same corner in every town room and field.
export function overflowPlate(ctx: CanvasRenderingContext2D, count: number, width: number): void {
  if (count > 0) plate(ctx, [[tr(`ほか ${count}人`, `${count} more`), "#ffe066", 20]], width - 72, 8);
}

export function label(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, color = "#ffffff", size = 10, mark?: IconName): void {
  ctx.font = `${size}px "DotGothic16", monospace`;
  ctx.textAlign = "center";
  const maxWidth = mark ? 140 : 160;
  if (ctx.measureText(value).width > maxWidth) {
    const letters = Array.from(value);
    let low = 0, high = letters.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (ctx.measureText(`${letters.slice(0, mid).join("")}…`).width <= maxWidth) low = mid;
      else high = mid - 1;
    }
    value = `${letters.slice(0, low).join("")}…`;
  }
  if (mark) {
    const left = Math.round(x - (ctx.measureText(value).width + 20) / 2);
    drawIcon(ctx, mark, left, Math.round(y - size / 2 - 8), color);
    x += 10;
  }
  ctx.fillStyle = "#1d1726";
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.fillText(value, x + dx, y + dy);
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, r: number, strength: number): void {
  const g = ctx.createRadialGradient(x, y, 1, x, y, r);
  g.addColorStop(0, `rgba(${color}, ${strength})`);
  g.addColorStop(1, `rgba(${color}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// A map-scale battle, both facing each other: the hero swings; on an "error" beat the monster strikes back.
function battle(ctx: CanvasRenderingContext2D, art: Sheets, fight: Fight, t: number, mark?: NoticeMarkFrame): void {
  const { x, y } = fight;
  const cycle = t % 4200;
  const enemyTurn = fight.demo ? cycle > 2600 && cycle < 3600 : Boolean(fight.counter);
  const effects = battlePresentation(fight, fight.demo ? true : fight.success, Math.floor(t / 4200), fight.damage?.hero ?? 23, 300);
  const phase = cycle % (1100 + effects.windup);
  const heroFrame = enemyTurn ? (cycle > 2950 ? "hurt" : "ready") : phase < 700 ? "ready" : phase < 700 + effects.windup ? "wind-up" : "slash";
  const side = `${fight.monster}-side`;
  const mx = x + (art.entry(side).reach ?? 60);
  fight.party.forEach((id, i) => {
    const swing = Math.floor((t + i * 300) / 350) % 2 ? 0 : 1;
    art.draw(ctx, id, enemyTurn ? "right" : art.pose(id, "attack", swing), x - 34 - Math.floor(i / 2) * 28, y - 22 + (i % 2) * 38);
  });
  drawNoticeHero(ctx, art, art.variant("hero-battle", fight.variant), heroFrame, x + (heroFrame === "slash" ? 4 : 0) - (heroFrame === "hurt" ? 3 : 0), y, mark);
  if (enemyTurn) {
    const strike = cycle > 2950 && cycle < 3350;
    art.draw(ctx, side, art.pose(side, "attack", strike ? 1 : 0), mx - (strike && fight.monster !== "monster-dragon" ? 8 : 0), y);
    if (strike) art.draw(ctx, "fx-enemy", art.pose("fx-enemy", fight.fx, Math.floor(t / 120) % 2), x + 4, y - 18);
    if (cycle > 3000 && fight.damage) label(ctx, `-${fight.damage.enemy}`, x, y - 62 - Math.min(12, (cycle - 3000) / 20), "#ff6b5b", 14);
  } else {
    const hurt = heroFrame === "slash";
    art.draw(ctx, side, hurt ? "hurt" : art.pose(side, "idle", Math.floor(t / 450) % 2), mx + (hurt ? 3 : 0), y);
    if (hurt) {
      art.draw(ctx, "fx-battle", art.pose("fx-battle", "slash", Math.floor((cycle % 300) / 100)), mx - 8, y - 18);
      if (fight.damage || fight.weaponTier) {
        if (effects.damage !== undefined) label(ctx, String(effects.damage), mx, y - 66, "#ffffff", 14);
        if (effects.critical) label(ctx, tr("かいしんの いちげき！", "Critical hit!"), mx, y - 84, "#ffe066", 10);
      }
    }
  }
  label(ctx, fight.target, mx, y + 14, "#ffe7a3");
  if (!enemyTurn && heroFrame === "wind-up" && effects.charging) label(ctx, tr("ちからを ためている…", "Charging…"), x, y - 76, "#ffe066", 10);
  label(ctx, `${fight.name} Lv${fight.level}`, x - 6, y + 28);
  if (fight.branch) label(ctx, fight.branch, x - 6, y + 40, "#9fd3ff", 8, "branch");
  weaponBesideLabel(ctx, art, fight.weaponTier, t, `${fight.name} Lv${fight.level}`, x - 6, y + 28);
}

// A won battle: the hero stands in victory and a chest is left where the monster fell.
// The chest stays closed and sparkling until you open (click) it; then it shows the report.
function victory(ctx: CanvasRenderingContext2D, art: Sheets, fight: Fight, t: number, read: boolean, mark?: NoticeMarkFrame): void {
  const cx = fight.x + 46;
  drawNoticeHero(ctx, art, art.variant("hero-battle", fight.variant), read ? "ready" : "victory", fight.x, fight.y, mark);
  art.draw(ctx, "ui-report", read ? "treasure chest open glowing" : "treasure chest closed", cx, fight.y);
  if (!read) {
    if (Math.floor(t / 300) % 2) art.draw(ctx, "fx-battle", art.pose("fx-battle", "spell", Math.floor(t / 150) % 3), cx, fight.y - 10);
    art.draw(ctx, "ui-balloons", "exclamation", cx, fight.y - 34 - (Math.floor(t / 400) % 2));
  }
  label(ctx, read ? tr("かくにん ずみ", "Seen") : tr("しょうり！", "Victory!"), cx, fight.y + 14, read ? "#c9c3dc" : "#ffe066");
  label(ctx, `${fight.name} Lv${fight.level}`, fight.x - 6, fight.y + 28);
  if (fight.branch) label(ctx, fight.branch, fight.x - 6, fight.y + 40, "#9fd3ff", 8, "branch");
  weaponBesideLabel(ctx, art, fight.weaponTier, t, `${fight.name} Lv${fight.level}`, fight.x - 6, fight.y + 28);
}

// Ways out of each field: back to town and over to the other fields.
export const FIELD_EXITS: Record<Theme, { to: "town" | Theme; text: string; x: number; y: number }[]> = {
  meadow: [{ to: "town", text: tr("◀ まち", "◀ TOWN"), x: 46, y: 243 }, { to: "cave", text: tr("どうくつ ▲", "CAVE ▲"), x: 906, y: 24 }, { to: "forest", text: tr("よるのもり ▶", "NIGHT FOREST ▶"), x: 906, y: 498 }],
  cave: [{ to: "town", text: tr("◀ まち", "◀ TOWN"), x: 46, y: 239 }, { to: "meadow", text: tr("そうげん ▶", "MEADOW ▶"), x: 906, y: 56 }, { to: "forest", text: tr("よるのもり ▶", "NIGHT FOREST ▶"), x: 906, y: 436 }],
  forest: [{ to: "town", text: tr("◀ まち", "◀ TOWN"), x: 46, y: 250 }, { to: "meadow", text: tr("そうげん ▶", "MEADOW ▶"), x: 906, y: 91 }, { to: "cave", text: tr("どうくつ ▶", "CAVE ▶"), x: 906, y: 455 }],
};

export function drawField(ctx: CanvasRenderingContext2D, art: Sheets, theme: Theme, t: number, fights: Fight[], read = new Set<string>(), overflow = 0, notice?: NoticeMarkFrame, town?: string): void {
  const backdrop = `bg-field-${theme}`;
  const field = art.entry(backdrop).field!;
  ctx.drawImage(art.image(backdrop)!, 0, 0);
  // The picture owns darkness and steady illumination; only the local light varies.
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (const [kind, x, y] of field.lights) {
    const warm = kind === "torch" || kind === "lantern";
    const pulse = warm
      ? Math.sin(t / 90 + x) * Math.sin(t / 230 + y)
      : Math.sin(t / 900 + x);
    const strength = warm ? 0.12 + 0.075 * pulse : 0.1 + 0.065 * pulse;
    const color = warm ? "255, 170, 80" : kind === "crystal" ? "90, 180, 255" : "70, 235, 220";
    glow(ctx, x, y, color, warm ? 36 : 26, strength);
    glow(ctx, x, y, color, warm ? 7 : 10, strength * 0.7);
  }
  ctx.restore();
  for (const fight of [...fights].sort((a, b) => a.y - b.y)) {
    const mark = notice?.id === fight.id ? notice : undefined;
    if (fight.done) victory(ctx, art, fight, t, read.has(fight.name), mark);
    else battle(ctx, art, fight, t + fight.x * 7, mark);
  }

  if (theme === "meadow") {
    for (let i = 0; i < 3; i++) art.draw(ctx, "amb-butterfly", art.pose("amb-butterfly", i % 2 ? "white" : "yellow", Math.floor(t / 110) % 2), 480 + Math.sin(t / 1600 + i * 2) * 300, 320 + Math.sin(t / 900 + i) * 120);
  } else if (theme === "forest") {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 16; i++) {
      const fx = (i * 137 + Math.sin(t / 1300 + i) * 60 + t / 50) % FIELD_W, fy = 120 + (i * 53) % 380 + Math.cos(t / 900 + i) * 20;
      const blink = 0.5 + 0.5 * Math.sin(t / 380 + i * 7);
      if (blink > 0.3) glow(ctx, fx, fy, "210, 255, 120", 6, 0.6 * blink);
    }
    ctx.restore();
  }
  const place = theme === "meadow" ? tr("そうげん", "MEADOW") : theme === "cave" ? tr("どうくつ", "CAVE") : tr("よるのもり", "NIGHT FOREST");
  placeTitle(ctx, place, FIELD_W / 2, 8, town);
  overflowPlate(ctx, overflow, FIELD_W);
}
