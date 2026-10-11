// Agent Quest: hand-built pixel lettering and sword. Node built-ins only.
// Run: node tools/art/logo.mjs. Archived sword studies are in .art-work/s84/.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const out = resolve(root, "public/logo"), studies = resolve(root, ".art-work/s84");
const palette = readFileSync(resolve(root, "tools/art/resurrect-64.hex"), "utf8").trim().split(/\s+/);
const C = { ink: "323353", night: "2e222f", shadow: "694f62", stone: "c7dcd0", white: "ffffff",
  steel: "8fd3ff", gold: "fbb954", pale: "fbff86", bronze: "cd683d", grip: "7a3045" };
const font = {
  A: "01110/10001/10001/11111/10001/10001/10001", G: "01111/10000/10000/10111/10001/10001/01111",
  E: "11111/10000/10000/11110/10000/10000/11111", N: "10001/11001/10101/10011/10001/10001/10001",
  T: "11111/00100/00100/00100/00100/00100/00100", Q: "01110/10001/10001/10001/10001/10001/01110/00011",
  U: "10001/10001/10001/10001/10001/10001/01110", S: "01111/10000/10000/01110/00001/00001/11110",
};
// Display lettering has two-pixel stems and bars, not a blown-up 5×7 font.
const boldFont = {
  A: "0011100/0111110/1100011/1100011/1111111/1111111/1100011/1100011/1100011",
  G: "0111111/1111111/1100000/1100000/1101111/1101111/1100011/1111111/0111110",
  E: "1111111/1111111/1100000/1111110/1111110/1100000/1100000/1111111/1111111",
  N: "1100011/1110011/1111011/1111011/1101111/1101111/1100111/1100011/1100011",
  T: "1111111/1111111/0011100/0011100/0011100/0011100/0011100/0011100/0011100",
  Q: "0111110/1111111/1100011/1100011/1100011/1100011/1100011/1111111/0111110/0000111",
  U: "1100011/1100011/1100011/1100011/1100011/1100011/1100011/1111111/0111110",
  S: "0111111/1111111/1100000/1111110/0111111/0000011/0000011/1111111/1111110",
};
function image(w, h, bg = null) { return { w, h, p: Array(w * h).fill(bg) }; }
function rect(im, x, y, w, h, c) {
  if (c !== null && !palette.includes(c)) throw new Error(`Not Resurrect 64: ${c}`);
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++)
    if (i >= 0 && i < im.w && j >= 0 && j < im.h) im.p[j * im.w + i] = c;
}
function paste(dst, src, x, y, s = 1) {
  for (let j = 0; j < src.h; j++) for (let i = 0; i < src.w; i++)
    if (src.p[j * src.w + i]) rect(dst, x + i * s, y + j * s, s, s, src.p[j * src.w + i]);
}
function sword() {
  const im = image(16, 16);
  // A strict 1:1 staircase: no interpolated diagonals or stray sparkle pixels.
  rect(im, 13, 0, 1, 1, C.ink); rect(im, 12, 1, 3, 1, C.ink); rect(im, 13, 1, 1, 1, C.white);
  const blade = [C.ink, C.stone, C.white, C.steel, C.ink];
  for (let y = 2; y <= 8; y++) blade.forEach((c, x) => rect(im, 13 - y + x, y, 1, 1, c));
  // Purple leather, a distinct pommel, and a crossguard perpendicular to the blade.
  for (let n = 0; n < 4; n++) {
    rect(im, 4 - n, 10 + n, 4, 1, C.ink); rect(im, 5 - n, 10 + n, 1, 1, C.grip);
    rect(im, 6 - n, 10 + n, 1, 1, C.bronze);
  }
  rect(im, 0, 13, 4, 3, C.ink); rect(im, 1, 13, 2, 2, C.gold); rect(im, 1, 13, 1, 1, C.pale);
  rect(im, 3, 7, 2, 1, C.ink);
  for (let n = 0; n < 5; n++) {
    rect(im, 2 + n, 8 + n, 4, 1, C.ink);
    rect(im, 3 + n, 8 + n, 1, 1, C.pale); rect(im, 4 + n, 8 + n, 1, 1, C.gold);
  }
  rect(im, 7, 13, 2, 1, C.ink);
  return im;
}
// RGBA PNG, filter 0. Every scale operation is nearest-neighbour and integer.
function crc(buf) {
  let c = 0xffffffff;
  for (const byte of buf) { c ^= byte; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]), result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length); body.copy(result, 4); result.writeUInt32BE(crc(body), body.length + 4); return result;
}
function png(im, scale = 1) {
  const w = im.w * scale, h = im.h * scale, data = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = im.p[Math.floor(y / scale) * im.w + Math.floor(x / scale)], n = y * (w * 4 + 1) + 1 + x * 4;
    if (c) { data[n] = parseInt(c.slice(0, 2), 16); data[n + 1] = parseInt(c.slice(2, 4), 16); data[n + 2] = parseInt(c.slice(4), 16); data[n + 3] = 255; }
  }
  const head = Buffer.alloc(13); head.writeUInt32BE(w); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", deflateSync(data)), chunk("IEND", Buffer.alloc(0))]);
}
function save(im, path, scale = 1) { writeFileSync(path, png(im, scale)); }
function svg(im, path) {
  const pixels = im.p.map((c, n) => c ? `<rect x="${n % im.w}" y="${Math.floor(n / im.w)}" width="1" height="1" fill="#${c}"/>` : "").join("");
  writeFileSync(path, `<svg xmlns="http://www.w3.org/2000/svg" width="${im.w}" height="${im.h}" viewBox="0 0 ${im.w} ${im.h}" shape-rendering="crispEdges" role="img" aria-label="AGENT QUEST">${pixels}</svg>\n`);
}
mkdirSync(out, { recursive: true }); mkdirSync(studies, { recursive: true });
// Selected after reviewing upright / diagonal / broad side by side; see s84/report.md.
const selected = sword();
function lettering(str, sx, sy, bold = false) {
  const glyphs = bold ? boldFont : font;
  const advance = (bold ? 7 : 5) * sx + (bold ? 6 : 4), margin = bold ? 4 : 2;
  const mask = image(str.length * advance - (bold ? 6 : 4) + margin * 2, (bold ? 10 : 8) * sy + margin * 2 + (bold ? 3 : 1));
  [...str].forEach((ch, n) => glyphs[ch].split("/").forEach((row, y) => [...row].forEach((v, x) => {
    if (v === "1") rect(mask, margin + n * advance + x * sx, margin + y * sy, sx, sy, C.stone);
  })));
  const im = image(mask.w, mask.h), radius = bold ? 2 : 1;
  for (let y = 0; y < mask.h; y++) for (let x = 0; x < mask.w; x++) if (mask.p[y * mask.w + x]) {
    for (let d = bold ? 4 : 2; d > 0; d--) rect(im, x + 1, y + d, 1, 1, C.shadow);
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++)
      if (Math.abs(dx) + Math.abs(dy) <= radius) rect(im, x + dx, y + dy, 1, 1, C.ink);
  }
  for (let y = 0; y < mask.h; y++) for (let x = 0; x < mask.w; x++) if (mask.p[y * mask.w + x]) {
    const row = Math.floor((y - margin) / sy);
    let color = row < 4 ? C.stone : C.gold;
    if (bold) {
      color = row < 4 ? C.stone : row === 4 ? C.pale : row < 8 ? C.gold : C.bronze;
      if (!mask.p[(y - 1) * mask.w + x]) color = C.white;
      else if (!mask.p[y * mask.w + x - 1]) color = row < 4 ? C.steel : C.pale;
    }
    rect(im, x, y, 1, 1, color);
  }
  return im;
}
function wordmark(sx, sy, bold = false) {
  const top = lettering("AGENT", sx, sy, bold), bottom = lettering("QUEST", sx, sy, bold);
  const offset = (bold ? 9 : 7) * sy + (bold ? 9 : 7), im = image(top.w, offset + bottom.h);
  paste(im, top, 0, 0); paste(im, bottom, 0, offset); return im;
}
function lockup(word, iconScale) {
  const im = image(16 * iconScale + 6 + word.w, Math.max(16 * iconScale, word.h));
  paste(im, selected, 0, Math.floor((im.h - 16 * iconScale) / 2), iconScale);
  paste(im, word, 16 * iconScale + 6, Math.floor((im.h - word.h) / 2)); return im;
}
const word = wordmark(2, 1), logo = lockup(word, 1), title = lockup(wordmark(2, 2, true), 4);
save(word, resolve(out, "wordmark.png")); save(logo, resolve(out, "logo.png")); svg(logo, resolve(out, "logo.svg"));
save(title, resolve(out, "title.png"), 4); svg(title, resolve(out, "title.svg"));
save(selected, resolve(out, "icon-16.png")); save(selected, resolve(out, "icon-32.png"), 2); svg(selected, resolve(out, "icon.svg"));
// ICO holds the exact 16px and 32px PNGs, not resampled artwork.
const icons = [png(selected), png(selected, 2)], ico = Buffer.alloc(6 + 16 * icons.length);
ico.writeUInt16LE(1, 2); ico.writeUInt16LE(icons.length, 4); let offset = ico.length;
icons.forEach((data, n) => {
  const i = 6 + 16 * n; ico[i] = ico[i + 1] = 16 * (n + 1); ico.writeUInt16LE(1, i + 4); ico.writeUInt16LE(32, i + 6);
  ico.writeUInt32LE(data.length, i + 8); ico.writeUInt32LE(offset, i + 12); offset += data.length;
});
writeFileSync(resolve(root, "public/favicon.ico"), Buffer.concat([ico, ...icons]));
const card = image(320, 160, C.night);
rect(card, 12, 12, 296, 1, C.shadow); rect(card, 12, 147, 296, 1, C.shadow);
rect(card, 28, 138, 264, 1, C.ink);
paste(card, title, Math.floor((card.w - title.w) / 2), Math.floor((card.h - title.h) / 2));
save(card, resolve(out, "og-1280x640.png"), 4);
const terminal = lockup(wordmark(1, 1), 1);
const colors = [...new Set(terminal.p.filter(Boolean))];
const rows = Array.from({ length: terminal.h }, (_, y) => terminal.p.slice(y * terminal.w, (y + 1) * terminal.w)
  .map(c => c ? colors.indexOf(c).toString(16) : ".").join(""));
writeFileSync(resolve(root, "src/server/logo-pixels.ts"), `// Generated by tools/art/logo.mjs; same pixels as the browser logo.\nexport const logoColors = ${JSON.stringify(colors)};\nexport const logoPixels = [\n${rows.map(row => `  "${row}",`).join("\n")}\n];\n`);
writeFileSync(resolve(studies, "assets.json"), `${JSON.stringify({ logo: [logo.w, logo.h], title: [title.w, title.h], terminal: [terminal.w, terminal.h], selected: "diagonal" }, null, 2)}\n`);
console.log(`Wrote logo, title, favicon, OG image and terminal pixels; metadata in ${studies}`);
