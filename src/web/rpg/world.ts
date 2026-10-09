import { mirror } from "./art/pixel";
import { paint } from "./sprites";

// The town and the field beyond its fence, 480×270 pixels. Drawn once into an offscreen canvas.
export const W = 480;
export const H = 270;
export const FENCE_X = 308;

// Where things happen (feet positions).
export const SPOTS = {
  gate: { x: -14, y: 124 },
  library: { x: 56, y: 96 }, board: { x: 137, y: 96 }, church: { x: 208, y: 96 },
  tower: { x: 273, y: 98 }, campfire: { x: 140, y: 160 }, crystal: { x: 263, y: 178 },
  shop: { x: 212, y: 240 }, you: { x: 286, y: 262 },
  innDoor: { x: 92, y: 178 },
};
export const BEDS = [26, 66, 106, 146].map((x) => ({ x: x + 14, y: 204 }));
export const LANES = [100, 146, 192, 238].map((y) => ({ hero: { x: 350, y }, monster: { x: 430, y } }));

// Signs drawn as text over the map.
export const SIGNS = [
  { text: "としょかん", x: 56, y: 41 }, { text: "クエスト", x: 137, y: 37 }, { text: "きょうかい", x: 236, y: 84 },
  { text: "ものみのとう", x: 300, y: 70 }, { text: "やどや", x: 64, y: 158 }, { text: "どうぐや", x: 250, y: 228 },
  { text: "ぼうけんのしょ", x: 263, y: 186 }, { text: "まちのそと", x: 396, y: 30 },
];
const SIGN_TEXT_PX = 5; // pixel font size the scene uses for sign text

function noise(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

const TREE = mirror([
  "....kkkk", "..kkgggg", ".kgggGgg", ".kgGgggg", "kggggGgg", "kgGggggg", "kggggggG", "kGggGggg",
  "kgggggGg", ".kGggggg", ".kkGGGGG", "...kkkkk", "......kb", "......kb", ".....kbb",
]);
const BUSH = mirror(["..kkk", ".kggg", "kgGgg", "kggGg", ".kkkk"]);

export function drawWorld(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const r = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  // Grass: town is brighter than the wild field.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = noise(x, y);
    const field = x >= FENCE_X;
    r(x, y, 1, 1, n > 0.93 ? (field ? "#3f7f3a" : "#4f9c45") : n < 0.05 ? (field ? "#5a9e4c" : "#7cc464") : field ? "#4b8f44" : "#63b052");
  }
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(noise(i, 7) * (FENCE_X - 10)), y = Math.floor(noise(i, 13) * H);
    r(x, y, 1, 1, ["#ffffff", "#ffe066", "#ff8fb1", "#b3d9ff"][i % 4]);
  }
  // Cobblestone roads.
  const road = (x: number, y: number, w: number, h: number) => {
    r(x, y, w, h, "#cdb98f");
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      if ((xx + (Math.floor(yy / 4) % 2) * 2) % 5 === 0 || yy % 4 === 0) r(xx, yy, 1, 1, "#ad9a72");
      else if (noise(xx, yy) > 0.9) r(xx, yy, 1, 1, "#ddcba3");
    }
  };
  road(0, 116, FENCE_X + 2, 14);
  road(50, 80, 12, 36); road(131, 80, 12, 36); road(202, 80, 12, 36); road(267, 84, 12, 32);
  road(86, 130, 12, 38); road(206, 130, 12, 52); road(244, 130, 34, 36);
  // Campfire clearing.
  for (let y = -14; y <= 14; y++) for (let x = -20; x <= 20; x++) {
    if ((x * x) / 400 + (y * y) / 196 <= 1) r(140 + x, 150 + y, 1, 1, noise(x, y) > 0.8 ? "#9c7a4f" : "#b08c5c");
  }
  drawLibrary(r); drawBoard(r); drawChurch(r); drawTower(r); drawInn(r); drawShop(r); drawPlaza(r);
  drawField(ctx, r);
  // Wooden signboards; the scene writes their text on top.
  for (const sign of SIGNS) {
    const w = sign.text.length * SIGN_TEXT_PX + 6;
    const x = Math.round(sign.x - w / 2);
    r(x, sign.y, w, 9, "#1d1726"); r(x + 1, sign.y + 1, w - 2, 7, "#8a5a32"); r(x + 1, sign.y + 1, w - 2, 1, "#b07a44");
  }
  return canvas;
}

type Rect = (x: number, y: number, w: number, h: number, color: string) => void;

function roof(r: Rect, x: number, y: number, w: number, h: number, light: string, dark: string): void {
  for (let row = 0; row < h; row++) {
    const inset = Math.floor((h - row) / 3);
    r(x + inset, y + row, w - inset * 2, 1, row % 3 === 2 ? dark : light);
    for (let col = x + inset + (row % 6 < 3 ? 0 : 3); col < x + w - inset; col += 6) r(col, y + row, 1, 1, dark);
  }
  r(x, y + h, w, 1, "#1d1726");
}

function bricks(r: Rect, x: number, y: number, w: number, h: number, light: string, dark: string): void {
  r(x, y, w, h, light);
  for (let row = y; row < y + h; row += 4) {
    r(x, row, w, 1, dark);
    for (let col = x + ((row - y) % 8 === 0 ? 0 : 4); col < x + w; col += 8) r(col, row, 1, 4, dark);
  }
  r(x, y, 1, h, "#1d1726"); r(x + w - 1, y, 1, h, "#1d1726"); r(x, y + h - 1, w, 1, "#1d1726");
}

function windowPane(r: Rect, x: number, y: number, w: number, h: number, glass: string): void {
  r(x - 1, y - 1, w + 2, h + 2, "#1d1726");
  r(x, y, w, h, glass);
  r(x + Math.floor(w / 2), y, 1, h, "#5b3a22");
  r(x, y + Math.floor(h / 2), w, 1, "#5b3a22");
  r(x + 1, y + 1, 2, 1, "#ffffffaa");
}

function door(r: Rect, x: number, y: number, w: number, h: number): void {
  r(x - 1, y - 2, w + 2, h + 2, "#1d1726");
  r(x, y, w, h, "#7a4a2a");
  r(x + 1, y - 1, w - 2, 1, "#7a4a2a");
  for (let col = x + 2; col < x + w - 1; col += 3) r(col, y, 1, h, "#5b3a22");
  r(x + w - 3, y + Math.floor(h / 2), 1, 1, "#f4cc4e");
}

function drawLibrary(r: Rect): void {
  roof(r, 18, 18, 76, 22, "#4f78c4", "#33539a");
  bricks(r, 22, 40, 68, 42, "#cfc6b2", "#a99f8a");
  r(46, 42, 20, 8, "#5b3a22"); r(47, 43, 18, 6, "#e8d7a8");
  for (const wx of [29, 71]) {
    windowPane(r, wx, 54, 12, 12, "#2a2140");
    for (let i = 0; i < 5; i++) r(wx + 1 + i * 2, 55 + (i % 2), 2, 5, ["#c0504d", "#4f81bd", "#9bbb59", "#f79646", "#8064a2"][i]);
    for (let i = 0; i < 5; i++) r(wx + 1 + i * 2, 61, 2, 5 - (i % 2), ["#8064a2", "#f79646", "#4f81bd", "#c0504d", "#9bbb59"][i]);
  }
  door(r, 50, 66, 12, 16);
}

function drawBoard(r: Rect): void {
  r(115, 50, 3, 32, "#5b3a22"); r(156, 50, 3, 32, "#5b3a22");
  r(110, 44, 54, 6, "#8a3a2a"); r(110, 49, 54, 1, "#5e261c");
  r(111, 50, 52, 26, "#1d1726"); r(112, 51, 50, 24, "#b07a44");
  for (let y = 53; y < 74; y += 3) r(112, y, 50, 1, "#9a6738");
}

function drawChurch(r: Rect): void {
  // Steeple with its cross.
  r(207, 0, 2, 9, "#f4cc4e"); r(204, 3, 8, 2, "#f4cc4e");
  roof(r, 199, 9, 18, 14, "#d24a3c", "#9c2f26");
  bricks(r, 201, 24, 14, 14, "#f1ede4", "#d2cbbd");
  r(206, 28, 4, 6, "#1d1726"); r(207, 29, 2, 4, "#62d0ff");
  roof(r, 178, 34, 60, 16, "#d24a3c", "#9c2f26");
  bricks(r, 182, 50, 52, 32, "#f1ede4", "#d2cbbd");
  // Round stained glass.
  for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) {
    const d = x * x + y * y;
    if (d <= 25) r(208 + x, 58 + y, 1, 1, d > 18 ? "#1d1726" : ["#ff6b6b", "#ffd35a", "#62d0ff", "#9bdc6a"][(x + 5 + y + 5) % 4]);
  }
  door(r, 202, 68, 12, 14);
}

function drawTower(r: Rect): void {
  for (const lx of [257, 287]) r(lx, 40, 3, 46, "#6b4426");
  for (let i = 0; i < 4; i++) {
    for (let t = 0; t < 30; t++) r(258 + t, 44 + i * 10 + Math.floor(t / 3), 1, 1, "#5b3a22");
  }
  for (let y = 44; y < 86; y += 4) r(268, y, 10, 1, "#a06d3b");
  r(267, 40, 1, 46, "#7a4a2a"); r(278, 40, 1, 46, "#7a4a2a");
  r(252, 34, 42, 6, "#1d1726"); r(253, 35, 40, 4, "#a06d3b");
  r(258, 14, 30, 20, "#1d1726"); r(259, 15, 28, 18, "#b98552");
  for (let x = 261; x < 287; x += 4) r(x, 15, 1, 18, "#9a6738");
  windowPane(r, 268, 19, 10, 8, "#7fc8ff");
  roof(r, 254, 4, 38, 10, "#4f8a4a", "#336332");
  r(273, 0, 1, 5, "#1d1726"); r(274, 0, 5, 3, "#ff5b4f");
}

function drawInn(r: Rect): void {
  // A cut-away inn: back wall with windows, plank floor, four beds.
  r(6, 166, 174, 102, "#1d1726");
  r(8, 168, 170, 22, "#8a5a3a");
  for (let x = 8; x < 178; x += 6) r(x, 168, 1, 22, "#6e4529");
  r(8, 188, 170, 2, "#5b3a22");
  for (const wx of [24, 140]) windowPane(r, wx, 172, 14, 10, "#ffd98a");
  r(84, 166, 16, 24, "#2a1d16"); r(86, 168, 12, 22, "#3a2a1e");
  for (let y = 190; y < 266; y++) {
    r(8, y, 170, 1, y % 6 === 0 ? "#8f5f38" : "#b07a4a");
    for (let x = 8 + ((Math.floor(y / 6) * 17) % 40); x < 178; x += 40) if (y % 6 !== 0) r(x, y, 1, 1, "#8f5f38");
  }
  // Rug and lamp.
  r(60, 244, 66, 16, "#7a2f3a"); r(62, 246, 62, 12, "#a8414f");
  for (let x = 64; x < 122; x += 6) r(x, 251, 3, 2, "#e8c66a");
  r(118, 172, 4, 8, "#1d1726"); r(119, 173, 2, 6, "#ffe48a");
  for (const bed of BEDS) {
    const x = bed.x - 14, y = bed.y;
    r(x - 1, y - 1, 30, 30, "#1d1726");
    r(x, y, 28, 6, "#7a4a2a"); r(x + 1, y + 1, 26, 1, "#a06d3b");
    r(x + 1, y + 6, 26, 21, "#efe9dc");
    r(x + 1, y + 6, 26, 1, "#d2cbbd");
    r(x, y + 27, 28, 2, "#5b3a22");
    // Made bed: pillow and a folded quilt (a sleeper covers it).
    r(x + 6, y + 8, 16, 5, "#1d1726"); r(x + 7, y + 9, 14, 3, "#ffffff");
    r(x + 1, y + 16, 26, 11, "#1d1726"); r(x + 2, y + 17, 24, 9, "#5a7bc4"); r(x + 2, y + 17, 24, 2, "#7d9be0");
    for (let qx = x + 4; qx < x + 26; qx += 5) r(qx, y + 21, 2, 2, "#ffffff");
  }
}

function drawShop(r: Rect): void {
  r(188, 196, 2, 30, "#5b3a22"); r(234, 196, 2, 30, "#5b3a22");
  r(184, 184, 56, 12, "#1d1726");
  for (let x = 185; x < 239; x++) r(x, 185, 1, 10, Math.floor((x - 185) / 6) % 2 ? "#f4f0e6" : "#d24a3c");
  for (let x = 185; x < 239; x += 6) r(x + 1, 195, 4, 2, Math.floor((x - 185) / 6) % 2 ? "#f4f0e6" : "#d24a3c");
  r(190, 212, 44, 12, "#1d1726"); r(191, 213, 42, 10, "#a06d3b"); r(191, 213, 42, 2, "#c08a52");
  const pots = [["#ff6b6b", 194], ["#62d0ff", 202], ["#9bdc6a", 210], ["#ffd35a", 218], ["#c48cff", 226]] as const;
  for (const [color, x] of pots) {
    r(x, 205, 6, 8, "#1d1726"); r(x + 1, 207, 4, 5, color); r(x + 2, 204, 2, 2, "#1d1726"); r(x + 2, 208, 1, 1, "#ffffff");
  }
}

function drawPlaza(r: Rect): void {
  // Pedestal for the crystal of records; the crystal itself is animated in the scene.
  r(254, 166, 18, 8, "#1d1726"); r(255, 167, 16, 6, "#a3a8b4"); r(255, 167, 16, 1, "#c9ced8");
  r(258, 162, 10, 5, "#1d1726"); r(259, 163, 8, 3, "#8c92a0");
  // Campfire stones.
  for (let a = 0; a < 8; a++) {
    const x = Math.round(140 + Math.cos(a * Math.PI / 4) * 7), y = Math.round(152 + Math.sin(a * Math.PI / 4) * 4);
    r(x - 1, y - 1, 3, 2, "#6c7180");
  }
  r(134, 150, 12, 3, "#5b3a22"); r(137, 149, 6, 5, "#7a4a2a");
}

function drawField(ctx: CanvasRenderingContext2D, r: Rect): void {
  // Fence with a gate on the road.
  for (let y = 0; y < H; y += 6) {
    if (y > 108 && y < 132) continue;
    r(FENCE_X, y, 3, 5, "#1d1726"); r(FENCE_X + 1, y + 1, 1, 4, "#a06d3b");
  }
  r(FENCE_X - 1, 0, 1, 108, "#7a4a2a"); r(FENCE_X - 1, 132, 1, H - 132, "#7a4a2a");
  // Trampled battlegrounds.
  for (const lane of LANES) {
    for (let y = -7; y <= 4; y++) for (let x = -64; x <= 64; x++) {
      if ((x * x) / 4096 + (y * y) / 49 <= 1 && noise(lane.hero.x + x, lane.hero.y + y) > 0.25) {
        r(390 + x, lane.hero.y + y - 1, 1, 1, noise(x, y + lane.hero.y) > 0.7 ? "#6f8a4a" : "#5f7d42");
      }
    }
  }
  const tree = paint("tree", TREE, { k: "#1d1726", g: "#3f8f3f", G: "#2d6a30", b: "#6b4426" });
  const bush = paint("bush", BUSH, { k: "#1d1726", g: "#4e9e46", G: "#3a7a36" });
  for (const [x, y] of [[318, 8], [348, 2], [380, 10], [412, 4], [446, 10], [470, 2], [322, 252], [362, 256], [404, 250], [452, 254],
    [0, 4], [6, 236], [466, 64], [-4, 140]]) ctx.drawImage(tree, x, y);
  for (const [x, y] of [[104, 92], [168, 92], [240, 94], [292, 140], [180, 138], [100, 136], [300, 200], [244, 222]]) ctx.drawImage(bush, x, y);
}
