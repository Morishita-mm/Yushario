// Loads the packed pixel-art components (public/art) and draws single frames.
export interface Entry { id: string; group: string; name: string; frame: [number, number]; frames: string[]; colors: number; warning?: string }

// Hero colour variants: the tunic (blue ramp) and cape (red ramp) swapped for other palette ramps.
const TUNIC = ["#323353", "#484a77", "#4d65b4", "#4d9be6"];
const CAPE = ["#ae2334", "#e83b3b"];
const VARIANTS: [string[], string[]][] = [
  [["#165a4c", "#239063", "#1ebc73", "#91db69"], ["#4d65b4", "#4d9be6"]],
  [["#45293f", "#6b3e75", "#905ea9", "#a884f3"], ["#f79617", "#f9c22b"]],
  [["#0b5e65", "#0b8a8f", "#0eaf9b", "#30e1b9"], ["#6b3e75", "#905ea9"]],
  [["#6e2727", "#b33831", "#ea4f36", "#f57d4a"], ["#239063", "#1ebc73"]],
];
type Source = HTMLImageElement | HTMLCanvasElement;

function rgb(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

export class Sheets {
  private readonly images = new Map<string, Source>();
  readonly entries = new Map<string, Entry>();

  async load(): Promise<void> {
    const entries: Entry[] = await (await fetch("/art/manifest.json", { cache: "no-store" })).json();
    await Promise.all(entries.map(async (entry) => {
      const image = new Image();
      image.src = `/art/${entry.id}.png`;
      await image.decode();
      this.entries.set(entry.id, entry);
      this.images.set(entry.id, image);
    }));
  }

  image(id: string): Source | undefined {
    return this.images.get(id);
  }

  // `id~n`: colour variant n (1–4) of a hero sheet, made once from the original.
  variant(id: string, n: number): string {
    if (n <= 0) return id;
    const key = `${id}~${n}`;
    if (this.images.has(key)) return key;
    const source = this.images.get(id);
    const entry = this.entries.get(id);
    if (!source || !entry) return id;
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(source, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const [tunic, cape] = VARIANTS[(n - 1) % VARIANTS.length];
    const swap = new Map<number, number>([
      ...TUNIC.map((hex, i) => [rgb(hex), rgb(tunic[i])] as [number, number]),
      ...CAPE.map((hex, i) => [rgb(hex), rgb(cape[i])] as [number, number]),
    ]);
    for (let i = 0; i < data.data.length; i += 4) {
      const to = swap.get((data.data[i] << 16) | (data.data[i + 1] << 8) | data.data[i + 2]);
      if (to === undefined) continue;
      data.data[i] = to >> 16; data.data[i + 1] = (to >> 8) & 255; data.data[i + 2] = to & 255;
    }
    ctx.putImageData(data, 0, 0);
    this.images.set(key, canvas);
    this.entries.set(key, entry);
    return key;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  size(id: string): [number, number] {
    return this.entries.get(id)?.frame ?? [0, 0];
  }

  // Draws frame `index` with its bottom centre at (x, y). Missing components draw a placeholder box.
  draw(ctx: CanvasRenderingContext2D, id: string, index: number, x: number, y: number, flip = false, scale = 1): void {
    const entry = this.entries.get(id);
    const image = this.images.get(id);
    if (!entry || !image) {
      ctx.strokeStyle = "#ff00ff";
      ctx.strokeRect(Math.round(x - 8), Math.round(y - 16), 16, 16);
      return;
    }
    const [w, h] = entry.frame;
    const frame = ((index % entry.frames.length) + entry.frames.length) % entry.frames.length;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(image, frame * w, 0, w, h, Math.round(-w * scale / 2), Math.round(-h * scale), w * scale, h * scale);
    ctx.restore();
  }

  // Seamless ground: fill with the tile's dominant colour, then scatter small patches cut from the tile
  // (their dominant-colour pixels left out), so there is no grid and no seam. Cached per id/frame/size.
  texture(ctx: CanvasRenderingContext2D, id: string, index: number, x: number, y: number, w: number, h: number): void {
    const key = `tex:${id}:${index}:${w}x${h}`;
    let canvas = this.images.get(key) as HTMLCanvasElement | undefined;
    if (!canvas) {
      canvas = this.synthesise(id, index, w, h);
      if (!canvas) return;
      this.images.set(key, canvas);
    }
    ctx.drawImage(canvas, x, y);
  }

  private synthesise(id: string, index: number, w: number, h: number): HTMLCanvasElement | undefined {
    const entry = this.entries.get(id);
    const image = this.images.get(id);
    if (!entry || !image) return;
    const [tw, th] = entry.frame;
    const tile = document.createElement("canvas");
    tile.width = tw; tile.height = th;
    const tctx = tile.getContext("2d")!;
    tctx.drawImage(image, index * tw, 0, tw, th, 0, 0, tw, th);
    const pixels = tctx.getImageData(0, 0, tw, th).data;
    const counts = new Map<number, number>();
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] === 0) continue;
      const c = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const base = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = `#${base.toString(16).padStart(6, "0")}`;
    ctx.fillRect(0, 0, w, h);
    const out = ctx.getImageData(0, 0, w, h);
    let seed = 1234567 + index * 97 + w;
    const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const patch = 10;
    const patches = Math.round((w * h) / (patch * patch) * 0.9);
    for (let n = 0; n < patches; n++) {
      const sx = Math.floor(random() * (tw - patch)), sy = Math.floor(random() * (th - patch));
      const dx = Math.floor(random() * w), dy = Math.floor(random() * h);
      for (let py = 0; py < patch; py++) {
        for (let px = 0; px < patch; px++) {
          const si = ((sy + py) * tw + sx + px) * 4;
          if (pixels[si + 3] === 0) continue;
          const c = (pixels[si] << 16) | (pixels[si + 1] << 8) | pixels[si + 2];
          if (c === base) continue;
          const ox = (dx + px) % w, oy = (dy + py) % h;
          const di = (oy * w + ox) * 4;
          out.data[di] = pixels[si]; out.data[di + 1] = pixels[si + 1]; out.data[di + 2] = pixels[si + 2];
        }
      }
    }
    ctx.putImageData(out, 0, 0);
    return canvas;
  }

  // Fills a rectangle with a tile frame.
  tile(ctx: CanvasRenderingContext2D, id: string, index: number, x: number, y: number, w: number, h: number): void {
    const entry = this.entries.get(id);
    const image = this.images.get(id);
    if (!entry || !image) return;
    const [tw, th] = entry.frame;
    for (let ty = y; ty < y + h; ty += th) {
      for (let tx = x; tx < x + w; tx += tw) {
        const cw = Math.min(tw, x + w - tx), ch = Math.min(th, y + h - ty);
        ctx.drawImage(image, index * tw, 0, cw, ch, tx, ty, cw, ch);
      }
    }
  }
}
