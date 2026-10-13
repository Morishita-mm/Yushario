import { noticeArrowTop, noticeMarkMotion } from "../../core/notice-mark";
import type { HeroPlace, TownHero } from "../../core/town";
import type { Sheets } from "./sheets";

export type NoticeMarkFrame = {
  id: string; jump: number; bob: number;
  head?: { x: number; y: number };
  signTop?: number;
};

// One page-local notice target. Navigation/clicks dismiss it, never agent state.
export class NoticeMark {
  private target?: { id: string; at: number };

  start(id: string | undefined, at: number): void {
    this.target = id ? { id, at } : undefined;
  }

  clear(id?: string): void {
    if (id === undefined || id === this.target?.id) this.target = undefined;
  }

  frame(time: number, local: TownHero[], place: "world" | HeroPlace): NoticeMarkFrame | undefined {
    if (!this.target) return;
    // rAF's timestamp can precede a click handled in the same browser frame.
    const motion = noticeMarkMotion(Math.max(0, time - this.target.at));
    if (!motion || !local.some((hero) => hero.id === this.target!.id && hero.place === place)) {
      this.clear();
      return;
    }
    return { id: this.target.id, ...motion };
  }
}

// Only the sprite's drawing y changes; party, labels, paths and hitboxes stay put.
export function drawNoticeHero(ctx: CanvasRenderingContext2D, art: Sheets, sheet: string, pose: string,
  x: number, y: number, mark?: NoticeMarkFrame, flip = false): void {
  const drawnY = y - (mark?.jump ?? 0);
  art.draw(ctx, sheet, pose, x, drawnY, flip);
  if (mark) mark.head = { x, y: art.spriteTop(sheet, pose, drawnY) };
}

// Draw last, so reports/weather cannot hide the notice arrow. No sprite, no arrow.
export function drawNoticeArrow(ctx: CanvasRenderingContext2D, mark?: NoticeMarkFrame): void {
  if (!mark?.head) return;
  const x = Math.round(mark.head.x), y = noticeArrowTop(mark.head.y, mark.bob, mark.signTop);
  ctx.save();
  ctx.fillStyle = "#1d1726";
  ctx.fillRect(x - 15, y, 30, 6);
  for (let row = 0; row < 7; row++) ctx.fillRect(x - 15 + row * 2, y + 2 + row * 2, 30 - row * 4, 4);
  ctx.fillStyle = "#f9c22b";
  for (let row = 0; row < 6; row++) ctx.fillRect(x - 11 + row * 2, y + 4 + row * 2, 22 - row * 4, 2);
  ctx.restore();
}
