import type { Sheets } from "./sheets";
import { heroVariant } from "./appearance";

// The hero's front pose in the same colours it wears in town, for cards and lists.
export function heroPortrait(art: Sheets, hero: string | undefined, scale = 2): HTMLCanvasElement {
  const canvas = document.createElement("canvas"), [w, h] = art.size("hero-model");
  canvas.width = (w || 32) * scale; canvas.height = (h || 54) * scale; canvas.className = "hero-portrait";
  const ctx = canvas.getContext("2d");
  if (ctx && w) {
    ctx.imageSmoothingEnabled = false;
    art.draw(ctx, hero ? art.variant("hero-model", heroVariant(hero)) : "hero-model", "front", (w / 2) * scale, h * scale, false, scale);
  }
  return canvas;
}
