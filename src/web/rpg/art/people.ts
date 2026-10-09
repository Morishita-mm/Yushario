import type { Job } from "../../../core/story";
import { FRONT_HEADS, SIDE_HEADS } from "./heads";
import { blank, flip, mirror, overlay, recolor, shade, type Grid, type Palette } from "./pixel";

// Party members: the agent itself is the hero (勇者); subagents join as classes.
export type Pose =
  | "stand" | "walk1" | "walk2" | "wave1" | "wave2" | "read" | "pray" | "cheer"
  | "side" | "sidewalk" | "windup" | "slash" | "cast" | "sleep";

// Every frame is 32×24 with the feet at the bottom centre; the 16-wide figure sits at x = 8,
// leaving room for weapons swung to either side.
export const FRAME_W = 32;
export const FRAME_H = 24;
const X = 8;

export const BASE: Palette = {
  k: "#1d1726", K: "#3b2f4d", w: "#ffffff",
  s: "#f7cfa8", S: "#d99c7a", p: "#f29a9a", r: "#9c3446", e: "#2a2140",
  m: "#dfe5ef", M: "#8d99b3", g: "#f4cc4e", G: "#b98326", y: "#62d0ff",
  b: "#86532f", B: "#55341d", l: "#b9773f", L: "#7d4c27", v: "#a06d3b", x: "#d6a6ff",
};

// Per-job colours: h/H hair, a/A clothes, c/C cape or hood.
const JOBS: Record<Job, Palette> = {
  hero: { h: "#6a3d22", a: "#3f6fd8", c: "#d8413f" },
  warrior: { h: "#3b2a22", a: "#b5452c", c: "#6b4a2f" },
  mage: { h: "#d9d0c0", a: "#4b3fa8", c: "#2f2a6e" },
  thief: { h: "#2d2a33", a: "#8a5a32", c: "#3f8f4f" },
  priest: { h: "#e3b24a", a: "#f1f1f6", c: "#cf3f5a" },
};

export function palette(job: Job, colors: Partial<Record<"h" | "a" | "c", string>> = {}): Palette {
  const own = { ...JOBS[job], ...colors };
  return {
    ...BASE, ...own,
    H: shade(own.h!, -0.35), A: shade(own.a!, -0.3), C: shade(own.c!, -0.3),
    O: shade(own.a!, -0.18),
  };
}

// ---- Bodies (8 rows, 12–19) and legs (4 rows, 20–23). ----
const ARMOR = mirror([
  "....kaas",
  "..kmmaaa",
  ".kmMAaaa",
  ".kaaAaaa",
  ".kssgggy",
  "..kkAaaa",
  "..kcAaaa",
  "..kcAaak",
]);
const ROBE = mirror([
  "....kaas",
  "...kaaaa",
  "..kaOaaa",
  ".kaaOaaa",
  ".kssOccc",
  "..kkOaaa",
  "..kaOaaa",
  "..kaOaaa",
]);
const OUTFITS: Record<Job, Grid> = {
  hero: ARMOR,
  warrior: recolor(ARMOR, { c: "M" }),
  mage: ROBE,
  thief: recolor(ARMOR, { m: "l", M: "L" }),
  priest: recolor(ROBE, { c: "g" }),
};
const LEGS = {
  stand: mirror(["....kbbk", "....kbbk", "...kbBBk", "...kkkkk"]),
  walk1: ["....kbbkkbbk....", "....kbbk.kBBk...", "...kbBBk.kkkk...", "...kkkkk........"],
  robe: mirror(["..kaOaaa", "..kaOaaa", "..kccccc", "...kbbkk"]),
  robe1: ["..kaOaaaaaaOak..", "..kaOaaaaaaOak..", "..kcccccccccck..", "...kbbk..kkk...."],
};
const SIDE_BODY: Grid = [
  ".....kaak.......",
  "....kmmmaak.....",
  "...kcmMmaaak....",
  "...kcaMaaaak....",
  "...kcaaMgggk....",
  "...kckssAaak....",
  "...kcckkAaak....",
  "....kkaaaAk.....",
];
const SIDE_LEGS = {
  stand: [".....kbbk.......", ".....kbbk.......", ".....kbBBk......", ".....kkkkk......"],
  walk: ["....kbbkbbk.....", "...kbbk.kbbk....", "..kbBBk.kbBBk...", "..kkkkk.kkkkk..."],
  robe: ["....kaOaaak.....", "....kaOaaak.....", "....kcccccck....", ".....kbbkk......"],
};

// ---- Arm and weapon poses, drawn over the figure ("_" erases). ----
const WAVE_UP = [
  "..............kk",
  ".............kssk",
  ".............kssk",
  ".............kaak",
  ".............kaak",
  "............kaAk",
  "............kak",
];
const WAVE_SIDE = [
  ".............kk",
  "............kssk",
  "............kssk",
  "............kaak",
  "...........kaak",
  "...........kaAk",
  "...........kak",
];
const ERASE_RIGHT_ARM = ["____", "kAk_", "gk__", "k___"]; // at (12, 15)
const BOOK = ["Llllllll", "lwwwLwwwl", "lMMwLMMwl", "lwwwLwwwl", "lMMwLMMwl", "LlllLlllL"];
const PRAY = ["..kssk..", "..kssk..", "...kk..."];
const CHEER_ARM = [".kk", "kssk", "kssk", "kaak", "kaak", "kak"];

// Weapons point up; `grip` is the row held in the hand.
const WEAPONS: Record<Job, { grid: Grid; grip: number }> = {
  hero: { grid: ["kwk", "kmk", "kmk", "kmk", "kmk", "kMk", "GgG", "kbk", ".k."], grip: 7 }, // sword
  warrior: { grid: [".kk..", "kMmk.", "kMmmk", "kMmk.", ".kv..", "..v..", "..v..", "..v..", "..v.."], grip: 6 }, // axe
  mage: { grid: [".k.", "kxk", "xyx", "kvk", ".v.", ".v.", ".v.", ".v.", ".v.", ".v."], grip: 6 }, // staff
  thief: { grid: ["w", "m", "m", "M", "G", "L"], grip: 5 }, // dagger
  priest: { grid: [".g.", "ggg", ".g.", ".v.", ".v.", ".v.", ".v.", ".v.", ".v."], grip: 5 }, // cross staff
};

function isRobe(job: Job): boolean {
  return job === "mage" || job === "priest";
}

// Asleep in an inn bed: eyes shut, tucked under a quilt in the cape colour.
const PILLOW = ["..kkkkkkkkkkkkkkkk..", ".kwwwwwwwwwwwwwwwwk.", ".kwwwwwwwwwwwwwwwwk.", ".kmwwwwwwwwwwwwwwmk.", "..kkkkkkkkkkkkkkkk.."];
const QUILT = [
  "kkkkkkkkkkkkkkkkkkkkkkkk",
  "kccccccccccccccccccccccK",
  "kcwcccwcccwcccwcccwcccCk",
  "kccccccccccccccccccccccK",
  "kCCCCCCCCCCCCCCCCCCCCCCk",
  "kcccwcccwcccwcccwcccwccK",
  "kccccccccccccccccccccccK",
  "kCCCCCCCCCCCCCCCCCCCCCCk",
  "kkkkkkkkkkkkkkkkkkkkkkkk",
];

function sleeping(job: Job): Grid {
  const head = FRONT_HEADS[job].map((row, index) =>
    index === 7 ? row.replaceAll("e", "s") : index === 8 ? row.replaceAll("e", "k") : row);
  let grid = overlay(blank(FRAME_W, FRAME_H), PILLOW, X - 2, 6);
  grid = overlay(grid, head, X, 2);
  return overlay(grid, QUILT, X - 4, 14);
}

export function frame(job: Job, pose: Pose): Grid {
  if (pose === "sleep") return sleeping(job);
  let grid = blank(FRAME_W, FRAME_H);
  const side = ["side", "sidewalk", "windup", "slash", "cast"].includes(pose);
  if (side) {
    const legs = isRobe(job) ? SIDE_LEGS.robe : pose === "sidewalk" ? SIDE_LEGS.walk : SIDE_LEGS.stand;
    const body = isRobe(job) ? recolor(SIDE_BODY, { m: "a", M: "O", c: "a" }) : SIDE_BODY;
    grid = overlay(grid, [...SIDE_HEADS[job], ...body, ...legs], X, 0);
    return overlay(grid, sideArm(job, pose), 0, 0);
  }
  const legs = isRobe(job)
    ? (pose === "walk1" ? LEGS.robe1 : pose === "walk2" ? flip(LEGS.robe1) : LEGS.robe)
    : pose === "walk1" ? LEGS.walk1 : pose === "walk2" ? flip(LEGS.walk1) : LEGS.stand;
  grid = overlay(grid, [...FRONT_HEADS[job], ...OUTFITS[job], ...legs], X, 0);
  const { grid: weapon, grip } = WEAPONS[job];
  switch (pose) {
    case "wave1":
    case "wave2":
      grid = overlay(grid, ERASE_RIGHT_ARM, X + 12, 15);
      return overlay(grid, pose === "wave1" ? WAVE_UP : WAVE_SIDE, X, 6);
    case "read":
      return overlay(grid, BOOK, X + 3, 15);
    case "pray":
      return overlay(grid, PRAY, X + 4, 14);
    case "cheer":
      grid = overlay(grid, ERASE_RIGHT_ARM, X + 12, 15);
      grid = overlay(grid, CHEER_ARM, X + 13, 7);
      return overlay(grid, weapon, X + 14 - Math.floor(weapon[0].length / 2), 8 - grip);
    default:
      return overlay(grid, weapon, X + 14 - Math.floor(weapon[0].length / 2), 16 - grip);
  }
}

function sideArm(job: Job, pose: Pose): Grid {
  const { grid: weapon, grip } = WEAPONS[job];
  const center = Math.floor(weapon[0].length / 2);
  let grid = blank(FRAME_W, FRAME_H);
  const hand = (x: number, y: number) => {
    grid = overlay(grid, ["kk", "ss", "kk"], x, y);
  };
  switch (pose) {
    case "windup": {
      // Weapon raised overhead, ready to swing.
      grid = overlay(grid, weapon, X + 3 - center, 9 - grip);
      return overlay(grid, ["kssk..", "kssk..", ".kaak.", "..kaak", "...kak"], X + 2, 8);
    }
    case "slash": {
      grid = overlay(grid, ["kaaaak", "kAaaak"], X + 8, 14);
      hand(X + 13, 13);
      return overlay(grid, rotateRight(weapon), X + 15, 14);
    }
    case "cast": {
      grid = overlay(grid, ["..kk", ".kaak", "kaak", "kak"], X + 9, 10);
      hand(X + 11, 8);
      return overlay(grid, ["x.x", ".w.", "x.x"], X + 13, 6);
    }
    default:
      return overlay(grid, weapon, X + 9 - center, 17 - grip);
  }
}

function rotateRight(grid: Grid): Grid {
  const width = Math.max(...grid.map((row) => row.length));
  return Array.from({ length: width }, (_, x) =>
    grid.map((row) => row[x] ?? ".").reverse().join(""));
}
