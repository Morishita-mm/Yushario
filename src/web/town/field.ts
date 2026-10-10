import type { Theme } from "./ambient";
import type { Sheets } from "./sheets";

// One field map (960×540), composed from the supplied battles.
export const FIELD_W = 960;
export const FIELD_H = 540;

export type Fight = { id?: string; x: number; y: number; name: string; variant: number; monster: string; target: string; party: string[]; fx: number; done?: boolean; level: number; demo?: boolean; counter?: boolean; damage?: { hero: number; enemy: number } };

export function label(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, color = "#ffffff", size = 10): void {
  ctx.font = `${size}px "DotGothic16", monospace`;
  ctx.textAlign = "center";
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

// How far the monster stands from the hero (centre to centre), so they are within striking distance.
const REACH: Record<string, number> = { "monster-slime": 50, "monster-ghost": 54, "monster-golem": 68, "monster-dragon": 92 };

// A map-scale battle, both facing each other: the hero swings; on an "error" beat the monster strikes back.
function battle(ctx: CanvasRenderingContext2D, art: Sheets, fight: Fight, t: number): void {
  const { x, y } = fight;
  const cycle = t % 4200;
  const enemyTurn = fight.demo ? cycle > 2600 && cycle < 3600 : Boolean(fight.counter);
  const heroFrame = enemyTurn ? (cycle > 2950 ? 4 : 0) : cycle % 1400 < 700 ? 0 : cycle % 1400 < 1000 ? 1 : 2;
  const mx = x + (REACH[fight.monster] ?? 60);
  const side = `${fight.monster}-side`;
  fight.party.forEach((id, i) => {
    const swing = Math.floor((t + i * 300) / 350) % 2 ? 3 : 4;
    art.draw(ctx, id, enemyTurn ? 1 : swing, x - 34 - i * 8, y - 22 + i * 38);
  });
  art.draw(ctx, art.variant("hero-battle", fight.variant), heroFrame, x + (heroFrame === 2 ? 4 : 0) - (heroFrame === 4 ? 3 : 0), y);
  if (enemyTurn) {
    const strike = cycle > 2950 && cycle < 3350;
    art.draw(ctx, side, strike ? 4 : 3, mx - (strike && fight.monster !== "monster-dragon" ? 8 : 0), y);
    if (strike) art.draw(ctx, "fx-enemy", fight.fx + (Math.floor(t / 120) % 2), x + 4, y - 18);
    if (cycle > 3000 && fight.damage) label(ctx, `-${fight.damage.enemy}`, x, y - 62 - Math.min(12, (cycle - 3000) / 20), "#ff6b5b", 14);
  } else {
    const hurt = heroFrame === 2;
    art.draw(ctx, side, hurt ? 2 : Math.floor(t / 450) % 2, mx + (hurt ? 3 : 0), y);
    if (hurt) {
      art.draw(ctx, "fx-battle", Math.floor((cycle % 300) / 100), mx - 8, y - 18);
      if (fight.damage) label(ctx, String(fight.damage.hero), mx, y - 66, "#ffffff", 14);
    }
  }
  label(ctx, fight.target, mx, y + 14, "#ffe7a3");
  label(ctx, `${fight.name} Lv${fight.level}`, x - 6, y + 28);
}

// A won battle: the hero stands in victory and a chest is left where the monster fell.
// The chest stays closed and sparkling until you open (click) it; then it shows the report.
function victory(ctx: CanvasRenderingContext2D, art: Sheets, fight: Fight, t: number, read: boolean): void {
  const cx = fight.x + 46;
  art.draw(ctx, art.variant("hero-battle", fight.variant), read ? 0 : 5, fight.x, fight.y);
  art.draw(ctx, "ui-report", read ? 1 : 0, cx, fight.y);
  if (!read) {
    if (Math.floor(t / 300) % 2) art.draw(ctx, "fx-battle", 3 + (Math.floor(t / 150) % 3), cx, fight.y - 10);
    art.draw(ctx, "ui-balloons", 0, cx, fight.y - 34 - (Math.floor(t / 400) % 2));
  }
  label(ctx, read ? "かくにん ずみ" : "しょうり！", cx, fight.y + 14, read ? "#c9c3dc" : "#ffe066");
  label(ctx, `${fight.name} Lv${fight.level}`, fight.x - 6, fight.y + 28);
}

// Ways out of each field: back to town and over to the other fields.
export const FIELD_EXITS: Record<Theme, { to: "town" | Theme; text: string; x: number; y: number }[]> = {
  meadow: [{ to: "town", text: "◀ まち", x: 46, y: 270 }, { to: "cave", text: "どうくつ ▶", x: 906, y: 200 }, { to: "forest", text: "よるのもり ▶", x: 900, y: 340 }],
  cave: [{ to: "town", text: "◀ まち", x: 46, y: 270 }, { to: "meadow", text: "そうげん ▶", x: 906, y: 200 }, { to: "forest", text: "よるのもり ▶", x: 900, y: 340 }],
  forest: [{ to: "town", text: "◀ まち", x: 46, y: 270 }, { to: "meadow", text: "そうげん ▶", x: 906, y: 200 }, { to: "cave", text: "どうくつ ▶", x: 906, y: 340 }],
};

export function drawField(ctx: CanvasRenderingContext2D, art: Sheets, theme: Theme, t: number, fights: Fight[], read = new Set<string>(), overflow = 0): void {
  if (theme === "meadow") {
    art.texture(ctx, "tile-ground", 1, 0, 0, FIELD_W, FIELD_H);
    art.texture(ctx, "tile-ground", 0, 0, 270, 120, 40);
    art.draw(ctx, "obj-lake", 0, 800, 330);
    art.draw(ctx, "obj-water", 3, 700, 300); art.draw(ctx, "obj-water", 0, 900, 470);
    for (const [i, x, y] of [[0, 40, 90], [1, 120, 60], [0, 760, 80], [0, 880, 110], [1, 940, 200], [0, 60, 520], [2, 180, 520], [3, 450, 300], [3, 700, 520], [4, 860, 520], [2, 640, 300]]) art.draw(ctx, "obj-nature", i, x, y);
  } else if (theme === "cave") {
    art.texture(ctx, "tile-field", 0, 0, 0, FIELD_W, FIELD_H);
    art.texture(ctx, "tile-field", 1, 0, 0, FIELD_W, 96);
    art.texture(ctx, "tile-field", 2, 760, 420, 200, 120);
    art.draw(ctx, "obj-cave", 0, 60, 150);
    for (const [i, x, y] of [[3, 200, 92], [3, 600, 92], [3, 880, 92], [1, 140, 330], [1, 760, 250], [1, 880, 300], [2, 60, 470], [4, 700, 420], [4, 420, 520], [2, 900, 200]]) art.draw(ctx, "obj-cave", i, x, y);
    for (const [x, y] of [[420, 300], [680, 520], [160, 520]]) art.draw(ctx, "obj-water", 0, x, y);
  } else {
    art.texture(ctx, "tile-field", 3, 0, 0, FIELD_W, FIELD_H);
    art.texture(ctx, "tile-field", 4, 0, 300, 960, 40);
    art.draw(ctx, "obj-water", 1, 800, 220); art.draw(ctx, "obj-water", 2, 812, 210);
    for (const [i, x, y] of [[0, 40, 90], [1, 120, 70], [0, 200, 100], [1, 700, 80], [0, 900, 100], [1, 940, 320], [0, 40, 540], [1, 900, 540], [2, 760, 520], [3, 150, 380], [3, 460, 160], [3, 720, 400], [4, 430, 330]]) art.draw(ctx, "obj-forest-night", i, x, y);
  }
  for (const fight of [...fights].sort((a, b) => a.y - b.y)) {
    if (fight.done) victory(ctx, art, fight, t, read.has(fight.name));
    else battle(ctx, art, fight, t + fight.x * 7);
  }

  // Small life on the map, then darkness and lights for the cave and the night forest.
  if (theme === "meadow") {
    for (let i = 0; i < 3; i++) art.draw(ctx, "amb-butterfly", (i % 2) * 2 + (Math.floor(t / 110) % 2), 480 + Math.sin(t / 1600 + i * 2) * 300, 320 + Math.sin(t / 900 + i) * 120);
  } else {
    ctx.fillStyle = theme === "cave" ? "rgba(10, 6, 20, 0.5)" : "rgba(8, 16, 48, 0.45)";
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    if (theme === "cave") {
      for (const x of [200, 600, 880]) glow(ctx, x, 70, "255, 170, 80", 70, 0.3 + 0.08 * Math.sin(t / 90 + x));
      for (const [x, y] of [[700, 400], [420, 500]]) glow(ctx, x, y, "90, 200, 255", 50, 0.22 + 0.1 * Math.sin(t / 700 + x));
    } else {
      glow(ctx, 430, 300, "255, 200, 120", 70, 0.3);
      for (const [x, y] of [[150, 365], [460, 145], [720, 385]]) glow(ctx, x, y, "80, 255, 220", 40, 0.25 + 0.1 * Math.sin(t / 700 + x));
      for (let i = 0; i < 16; i++) {
        const fx = (i * 137 + Math.sin(t / 1300 + i) * 60 + t / 50) % FIELD_W, fy = 120 + (i * 53) % 380 + Math.cos(t / 900 + i) * 20;
        const blink = 0.5 + 0.5 * Math.sin(t / 380 + i * 7);
        if (blink > 0.3) glow(ctx, fx, fy, "210, 255, 120", 6, 0.6 * blink);
      }
    }
    ctx.restore();
  }
  label(ctx, theme === "meadow" ? "そうげん" : theme === "cave" ? "どうくつ" : "よるのもり", FIELD_W / 2, 26, "#fff7d6", 14);
  if (overflow) label(ctx, `ほか ${overflow}人`, FIELD_W / 2, FIELD_H - 18, "#ffe066", 14);
}
