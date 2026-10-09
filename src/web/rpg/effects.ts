import type { Grid } from "./art/pixel";
import { paint } from "./sprites";

// Balloons over heads and short-lived battle effects, all in map pixels.
export type Balloon = "exclaim" | "dots" | "zz" | "hourglass" | "note" | "sweat" | "heart";

const BALLOON_FRAME: Grid = [
  ".kkkkkkkkk.",
  "kwwwwwwwwwk",
  "kwwwwwwwwwk",
  "kwwwwwwwwwk",
  "kwwwwwwwwwk",
  "kwwwwwwwwwk",
  "kwwwwwwwwwk",
  ".kkkkwkkkk.",
  "....kwk....",
  ".....k.....",
];
const GLYPHS: Record<Balloon, Grid> = {
  exclaim: ["..r..", "..r..", "..r..", ".....", "..r.."],
  dots: [".....", ".....", ".....", ".....", "e.e.e"],
  zz: ["eeee.", "..e..", ".e...", "eeee.", "....."],
  hourglass: ["eeeee", ".eye.", "..e..", ".eye.", "eeeee"],
  note: ["..ee.", "..e.e", "..e..", "eee..", "ee..."],
  sweat: ["..b..", ".bbb.", "bbwbb", "bbbbb", ".bbb."],
  heart: [".r.r.", "rrrrr", "rrrrr", ".rrr.", "..r.."],
};
const COLORS = { k: "#1d1726", w: "#ffffff", r: "#e8443a", e: "#2a2140", y: "#f4cc4e", b: "#62b8ff" };

export function drawBalloon(ctx: CanvasRenderingContext2D, kind: Balloon, x: number, y: number): void {
  const frame = paint("balloon", BALLOON_FRAME, COLORS);
  const glyph = paint(`glyph:${kind}`, GLYPHS[kind], COLORS);
  ctx.drawImage(frame, Math.round(x - 5), Math.round(y - 10));
  ctx.drawImage(glyph, Math.round(x - 2), Math.round(y - 9));
}

interface Effect {
  kind: "number" | "text" | "slash" | "poof" | "sparkle" | "pillar";
  x: number;
  y: number;
  born: number;
  life: number;
  text?: string;
  color?: string;
}

export class Effects {
  private list: Effect[] = [];

  add(effect: Omit<Effect, "life"> & { life?: number }): void {
    this.list.push({ life: 900, ...effect });
    if (this.list.length > 80) this.list.shift();
  }

  // Effects drawn in map pixels; text is drawn by `drawText` on the scaled canvas.
  draw(ctx: CanvasRenderingContext2D, now: number): void {
    this.list = this.list.filter((effect) => now - effect.born < effect.life);
    for (const effect of this.list) {
      const t = (now - effect.born) / effect.life;
      switch (effect.kind) {
        case "slash": {
          ctx.fillStyle = `rgba(255,255,255,${1 - t})`;
          for (let i = 0; i < 9; i++) {
            const a = -0.9 + i * 0.22 + t * 0.6;
            ctx.fillRect(Math.round(effect.x + Math.cos(a) * 9), Math.round(effect.y + Math.sin(a) * 9), 2, 1);
          }
          break;
        }
        case "poof": {
          for (let i = 0; i < 10; i++) {
            const a = i * Math.PI / 5;
            const d = 3 + t * 14;
            ctx.fillStyle = i % 2 ? "#ffffff" : "#d8d2e6";
            ctx.fillRect(Math.round(effect.x + Math.cos(a) * d), Math.round(effect.y + Math.sin(a) * d * 0.7), t < 0.6 ? 3 : 2, t < 0.6 ? 3 : 2);
          }
          break;
        }
        case "sparkle": {
          ctx.fillStyle = effect.color ?? "#fff6a8";
          for (let i = 0; i < 6; i++) {
            const a = i * Math.PI / 3 + t * 2;
            const d = 4 + t * 10;
            const x = Math.round(effect.x + Math.cos(a) * d), y = Math.round(effect.y + Math.sin(a) * d - t * 6);
            ctx.fillRect(x, y - 1, 1, 3);
            ctx.fillRect(x - 1, y, 3, 1);
          }
          break;
        }
        case "pillar": {
          ctx.fillStyle = `rgba(255, 246, 168, ${0.55 * (1 - t)})`;
          ctx.fillRect(Math.round(effect.x - 7), 0, 14, Math.round(effect.y));
          ctx.fillStyle = `rgba(255, 255, 255, ${0.7 * (1 - t)})`;
          ctx.fillRect(Math.round(effect.x - 3), 0, 6, Math.round(effect.y));
          break;
        }
        default:
          break;
      }
    }
  }

  // Floating numbers and words, drawn after scaling so the pixel font stays sharp.
  drawText(ctx: CanvasRenderingContext2D, now: number): void {
    for (const effect of this.list) {
      if (effect.kind !== "number" && effect.kind !== "text") continue;
      const t = (now - effect.born) / effect.life;
      const rise = effect.kind === "number" ? Math.min(1, t * 3) * 10 : t * 8;
      const bounce = effect.kind === "number" && t < 0.33 ? Math.sin(t * 3 * Math.PI) * 3 : 0;
      ctx.globalAlpha = t > 0.75 ? (1 - t) * 4 : 1;
      outlined(ctx, effect.text ?? "", effect.x, effect.y - rise - bounce, effect.color ?? "#ffffff",
        effect.kind === "number" ? 9 : 7);
      ctx.globalAlpha = 1;
    }
  }
}

export function outlined(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, size: number): void {
  ctx.font = `${size}px "DotGothic16", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = "#1d1726";
  for (const [dx, dy] of [[-0.6, 0], [0.6, 0], [0, -0.6], [0, 0.6]]) ctx.fillText(text, x + dx, y + dy);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
