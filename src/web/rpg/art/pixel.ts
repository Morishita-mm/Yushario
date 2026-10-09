// Pixel art as rows of palette characters ("." is transparent). Pure data helpers, no DOM.
export type Grid = string[];
export type Palette = Record<string, string>;

// Symmetric art is written as left halves and mirrored around the centre.
export function mirror(half: Grid): Grid {
  return half.map((row) => row + [...row].reverse().join(""));
}

export function blank(width: number, height: number): Grid {
  return Array.from({ length: height }, () => ".".repeat(width));
}

// Draws `top` over `base` at (x, y); "." in `top` keeps what is below, "_" erases it.
export function overlay(base: Grid, top: Grid, x = 0, y = 0): Grid {
  const result = base.map((row) => [...row]);
  top.forEach((row, dy) => {
    [...row].forEach((pixel, dx) => {
      const line = result[y + dy];
      if (pixel !== "." && line && x + dx >= 0 && x + dx < line.length) line[x + dx] = pixel === "_" ? "." : pixel;
    });
  });
  return result.map((row) => row.join(""));
}

export function flip(grid: Grid): Grid {
  return grid.map((row) => [...row].reverse().join(""));
}

// Replaces palette characters, e.g. to recolour a part for another class.
export function recolor(grid: Grid, map: Record<string, string>): Grid {
  return grid.map((row) => [...row].map((pixel) => map[pixel] ?? pixel).join(""));
}

export function shade(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.max(0, Math.min(255,
    Math.round(((value >> shift) & 255) * (1 + amount))));
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`;
}
