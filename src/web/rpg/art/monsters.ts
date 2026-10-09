import type { MonsterKind } from "../../../core/story";
import { mirror, type Grid, type Palette } from "./pixel";

// Monsters stand for the work in front of an agent; each kind has a two-frame idle.

const OUTLINE = { k: "#1d1726", w: "#ffffff", e: "#1d1726", r: "#9c3446" };

const SLIME = mirror([
  ".......k",
  "......ka",
  ".....kaa",
  "....kaaa",
  "...kawaa",
  "..kawwaa",
  "..kaaaaa",
  ".kaaweaa",
  ".kaaeeaa",
  "kaaaraaa",
  "kAaaarrr",
  "kAAaaaaa",
  ".kAAAAAA",
  "..kkkkkk",
]);

const GHOST = mirror([
  ".....kkk",
  "...kkwww",
  "..kwwwww",
  ".kwwwwww",
  ".kwwkkww",
  "kwwwkkww",
  "kwwwwwww",
  "kwwwwwrr",
  "kOwwwwww",
  "kOwwwwww",
  "kOOwwwww",
  ".kOOwwww",
  "..kOOkOO",
  "...kk.kk",
]);

const GOLEM = mirror([
  "............",
  ".....kkkkkkk",
  "....kmmmmmmm",
  "....kmMmmmmm",
  "....kmmyymmm",
  "....kmmyymmm",
  "....kMmmmmmK",
  "..kkkMMmmmmm",
  ".kmmmkMMMMMM",
  "kmmmmkmmmmmm",
  "kmMmmkmmMmmm",
  "kmmmmkmmmmmm",
  "kMmmkmmmmmgg",
  "kMmmkmmmmmgg",
  "kmmmkMmmmmmm",
  ".kkkkMMmmmmm",
  "..kmmkMMMMMM",
  "....kmmmk...",
  "....kmMmk...",
  "...kmmmmmk..",
  "...kkkkkkk..",
]);

const DRAGON = mirror([
  "kk..............",
  "kvk.............",
  "kvvk........k...",
  "kvVvk.......kk..",
  "kvvVvk.....kakk.",
  "kvvvVvk...kaaaak",
  "kvvvvVvk.kaaaaaa",
  "kvvvvvVvkaawyaaa",
  "kvvvvvvVkaayyaaa",
  "kvvvvvvvkAaaaaaa",
  ".kvvvvvvkAaaakwk",
  "..kvvvvvkAAaakkk",
  "...kvvvkaaaaaccc",
  "....kvkaaAaacccc",
  ".....kaaAaaacccc",
  "....kaaAaaaacccc",
  "...kaaAaaaaacccc",
  "...kaAaaaaaacccc",
  "..kkaAaaaaaaacck",
  "..kaaakkaaaaaaak",
  "..kwkwk.kaaaaak.",
  "..kkkkk..kkkkk..",
]);

export const MONSTERS: Record<MonsterKind, { grid: Grid; palette: Palette; name: string }> = {
  slime: {
    grid: SLIME, name: "スライム",
    palette: { ...OUTLINE, a: "#4aa8ff", A: "#2a6fd0", e: "#1d1726" },
  },
  ghost: {
    grid: GHOST, name: "おばけ",
    palette: { ...OUTLINE, w: "#f1f0ff", O: "#b3b0dc", r: "#7a3a8c" },
  },
  golem: {
    grid: GOLEM, name: "しれんのゴーレム",
    palette: { ...OUTLINE, m: "#a3a8b4", M: "#6c7180", K: "#3b3f4a", y: "#ff5b4f", g: "#ffd35a" },
  },
  dragon: {
    grid: DRAGON, name: "ドラゴン",
    palette: { ...OUTLINE, a: "#46b25e", A: "#2c7a42", c: "#ecd58c", v: "#8a4fb8", V: "#5d2f86", y: "#ff4f3a", w: "#ffffff" },
  },
};

// The second idle frame squashes the monster by a pixel, like a breath.
export function monsterFrame(kind: MonsterKind, beat: 0 | 1): Grid {
  const grid = MONSTERS[kind].grid;
  if (!beat) return grid;
  const blankRow = ".".repeat(grid[0].length);
  return [blankRow, ...grid.slice(0, 3), ...grid.slice(4)];
}
