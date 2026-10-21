import { tr } from "../language";
import { label } from "./field";

type Spot = { x: number; y: number; w: number; h: number; text?: string; hoverOnly?: boolean };
// Map signs and the town gate's destinations; used by both live and demo maps.
export function drawNavigation(ctx: CanvasRenderingContext2D, spots: Spot[], pointer: [number, number], gateMenu: boolean): void {
  for (const spot of spots) {
    if (!spot.text) continue;
    const hover = pointer[0] >= spot.x && pointer[0] <= spot.x + spot.w && pointer[1] >= spot.y && pointer[1] <= spot.y + spot.h;
    if (spot.hoverOnly) {
      if (hover) label(ctx, spot.text, spot.x + spot.w / 2, spot.y - 6, "#ffe066", 11);
      continue;
    }
    ctx.fillStyle = "rgba(10, 10, 26, 0.85)";
    ctx.fillRect(spot.x, spot.y, spot.w, spot.h);
    ctx.strokeStyle = hover ? "#ffe066" : "#ffffff";
    ctx.lineWidth = 1;
    ctx.strokeRect(spot.x + 1.5, spot.y + 1.5, spot.w - 3, spot.h - 3);
    label(ctx, spot.text, spot.x + spot.w / 2, spot.y + spot.h / 2 + 4, hover ? "#ffe066" : "#ffffff", 11);
  }
  if (gateMenu) label(ctx, tr("どこへ いく？", "Where to?"), 480, 396, "#fff7d6", 12);
}
