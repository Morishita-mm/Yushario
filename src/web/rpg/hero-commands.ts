import { showHeroCommands } from "../town/command";
import type { Walker } from "../town/walkers";

export function openHeroCommands(layer: HTMLElement, canvas: HTMLCanvasElement, size: [number, number],
  name: string, walker: Walker | undefined, x: number, y: number,
  on: Parameters<typeof showHeroCommands>[3]): () => void {
  if (walker) walker.paused = true;
  const rect = canvas.getBoundingClientRect(), [w, h] = size;
  return showHeroCommands(layer, name, [x * rect.width / w, (y - 30) * rect.height / h], {
    ...on,
    closed: () => {
      if (walker) { walker.paused = false; walker.waitUntil = performance.now(); }
      on.closed();
    },
  });
}
