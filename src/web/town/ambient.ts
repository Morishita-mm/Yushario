import type { Sheets } from "./sheets";

// Life for a battle backdrop: flowing water by colour cycling, glowing lights found in the picture,
// and small particles per field (clouds, grass, butterflies / drips, dust, glints / fireflies, mist, leaves).
export type Theme = "meadow" | "cave" | "forest";

// Compatibility fallback for a backdrop without colour metadata: keep the previous inference.
const DEFAULT_RAMPS = [
  ["#323353", "#484a77", "#4d65b4", "#4d9be6", "#8fd3ff", "#ffffff"],
  ["#0b5e65", "#0b8a8f", "#0eaf9b", "#30e1b9", "#8ff8e2"],
].map((ramp) => ramp.map((hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))));

interface Light { x: number; y: number; kind: "warm" | "cool" | "moon"; phase: number }
interface Mote { x: number; y: number; vx: number; vy: number; phase: number }

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, max ? d / max : 0, max / 255];
}

export class Ambient {
  private readonly W: number;
  private readonly H: number;
  private readonly base: ImageData;
  private readonly frame: ImageData;
  private readonly canvas = document.createElement("canvas");
  private readonly water: { i: number; ramp: number; step: number; x: number; y: number }[] = [];
  private readonly lights: Light[] = [];
  private readonly motes: Mote[] = [];
  private lastWater = -Infinity;
  private readonly ramps: number[][][];

  constructor(private readonly art: Sheets, private readonly theme: Theme, private readonly backdrop: string) {
    const image = art.image(backdrop)!;
    this.ramps = art.entry(backdrop).water?.ramps.map((ramp) => ramp.map((hex) =>
      [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)))) ?? DEFAULT_RAMPS;
    [this.W, this.H] = [image.width, image.height];
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    const ctx = this.canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    this.base = ctx.getImageData(0, 0, this.W, this.H);
    this.frame = ctx.getImageData(0, 0, this.W, this.H);
    this.analyse();
    const count = theme === "forest" ? 22 : theme === "cave" ? 30 : 24;
    for (let i = 0; i < count; i++) {
      this.motes.push({ x: Math.random() * this.W, y: this.H * (0.25 + Math.random() * 0.6),
        vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 3, phase: Math.random() * 1000 });
    }
  }

  // Water: palette-ramp pixels below the horizon. Lights: bright saturated clusters.
  private analyse(): void {
    const { data } = this.base;
    const water = this.art.entry(this.backdrop).water;
    const cells = new Map<string, { x: number; y: number; n: number; kind: Light["kind"] }>();
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const i = (y * this.W + x) * 4;
        const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
        if (y > this.H * (water?.horizon ?? 0.45)) {
          this.ramps.forEach((ramp, rampIndex) => {
            const step = ramp.findIndex(([rr, gg, bb]) => rr === r && gg === g && bb === b);
            // Dark blues are mostly shadow, not water.
            if (step >= (water?.minimumSteps[rampIndex] ?? (rampIndex === 0 ? 2 : 0))) this.water.push({ i, ramp: rampIndex, step, x, y });
          });
        }
        const [h, s, v] = rgbToHsv(r, g, b);
        let kind: Light["kind"] | undefined;
        if (v > 0.85 && s > 0.45 && (h < 60 || h > 340)) kind = "warm";
        else if (v > 0.8 && s > 0.4 && h > 150 && h < 260 && y > this.H * 0.2) kind = "cool";
        else if (v > 0.95 && s < 0.15 && y < this.H * 0.45 && this.theme === "forest") kind = "moon";
        // A sunny sky is bright and blue too; only caves and night scenes have real lights.
        if (!kind || this.theme === "meadow") continue;
        const key = `${kind}:${Math.floor(x / 10)}:${Math.floor(y / 10)}`;
        const cell = cells.get(key) ?? { x: 0, y: 0, n: 0, kind };
        cell.x += x; cell.y += y; cell.n++;
        cells.set(key, cell);
      }
    }
    const lights = [...cells.values()].filter((cell) => cell.n >= (cell.kind === "moon" ? 12 : 3))
      .sort((a, b) => b.n - a.n);
    for (const kind of ["warm", "cool", "moon"] as const) {
      lights.filter((cell) => cell.kind === kind).slice(0, kind === "moon" ? 1 : 10)
        .forEach((cell) => this.lights.push({ x: cell.x / cell.n, y: cell.y / cell.n, kind, phase: Math.random() * 6 }));
    }
  }

  // Backdrop with flowing water, distant clouds and glowing lights.
  drawBack(ctx: CanvasRenderingContext2D, t: number): void {
    if (t - this.lastWater > 90 && this.water.length) {
      this.lastWater = t;
      const flow = this.theme === "meadow" ? 1 : 0.4;
      for (const px of this.water) {
        const ramp = this.ramps[px.ramp];
        const wave = Math.sin(t * 0.0035 * flow - px.x * 0.21 + Math.sin(px.y * 0.7) * 1.4 + px.y * 0.35);
        const shift = wave > 0.82 ? 1 : wave < -0.9 ? -1 : 0;
        const [r, g, b] = ramp[Math.max(0, Math.min(ramp.length - 1, px.step + shift))];
        this.frame.data[px.i] = r; this.frame.data[px.i + 1] = g; this.frame.data[px.i + 2] = b;
      }
      this.canvas.getContext("2d")!.putImageData(this.frame, 0, 0);
    }
    ctx.drawImage(this.canvas, 0, 0);
    if (this.theme === "meadow") {
      ([["cloud large", 0.06, 4], ["cloud medium", 0.16, 7], ["cloud small", 0.1, 10], ["cloud medium", 0.22, 5]] as const).forEach(([frame, y, speed], i) => {
        const x = ((t / 1000) * speed + i * 160) % (this.W + 80) - 40;
        ctx.globalAlpha = 0.9;
        this.art.draw(ctx, "amb-cloud", frame, x, this.H * y + 20);
        ctx.globalAlpha = 1;
      });
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const light of this.lights) {
      const pulse = light.kind === "warm"
        ? 0.55 + 0.25 * Math.sin(t / 90 + light.phase) * Math.sin(t / 230 + light.phase * 2)
        : light.kind === "moon" ? 0.5 + 0.15 * Math.sin(t / 1400) : 0.4 + 0.3 * Math.sin(t / 700 + light.phase);
      const radius = light.kind === "moon" ? 40 : light.kind === "warm" ? 16 : 11;
      const color = light.kind === "warm" ? "255, 170, 70" : light.kind === "moon" ? "220, 230, 255" : "90, 230, 255";
      const glow = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, radius);
      glow.addColorStop(0, `rgba(${color}, ${0.35 * pulse})`);
      glow.addColorStop(1, `rgba(${color}, 0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(light.x - radius, light.y - radius, radius * 2, radius * 2);
      if (light.kind === "cool" && Math.sin(t / 260 + light.phase * 7) > 0.96) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(Math.round(light.x) - 2, Math.round(light.y), 5, 1);
        ctx.fillRect(Math.round(light.x), Math.round(light.y) - 2, 1, 5);
      }
    }
    ctx.restore();
  }

  // Particles in front of the monster and the party.
  drawFront(ctx: CanvasRenderingContext2D, t: number, dt: number): void {
    const s = dt / 1000;
    for (const mote of this.motes) {
      mote.x = (mote.x + (mote.vx + Math.sin((t + mote.phase) / 900) * 4) * s + this.W) % this.W;
      mote.y += (mote.vy + Math.cos((t + mote.phase) / 1300) * 3) * s;
      if (mote.y < this.H * 0.2 || mote.y > this.H * 0.9) mote.vy = -mote.vy;
    }
    if (this.theme === "meadow") this.meadow(ctx, t);
    else if (this.theme === "cave") this.cave(ctx, t);
    else this.forest(ctx, t);
  }

  private meadow(ctx: CanvasRenderingContext2D, t: number): void {
    for (const mote of this.motes) {
      ctx.fillStyle = mote.phase % 3 < 1 ? "#fbff86" : "#ffffff";
      ctx.fillRect(Math.round(mote.x), Math.round(mote.y), 1, 1);
    }
    for (let i = 0; i < 2; i++) {
      const x = this.W * (0.3 + 0.4 * i) + Math.sin(t / 1700 + i * 2) * 60;
      const y = this.H * 0.55 + Math.sin(t / 900 + i) * 18;
      this.art.draw(ctx, "amb-butterfly", this.art.pose("amb-butterfly", i ? "white" : "yellow", Math.floor(t / 110) % 2), x, y);
    }
    [0.04, 0.22, 0.78, 0.96].forEach((fx, i) => {
      const sway = Math.sin(t / 700 + i * 1.7);
      this.art.draw(ctx, "amb-grass", sway > 0.35 ? "sway right" : sway < -0.35 ? "sway left" : "upright", this.W * fx, this.H + 2);
    });
  }

  private cave(ctx: CanvasRenderingContext2D, t: number): void {
    for (const mote of this.motes) {
      ctx.fillStyle = `rgba(200, 190, 230, ${0.25 + 0.2 * Math.sin((t + mote.phase) / 600)})`;
      ctx.fillRect(Math.round(mote.x), Math.round(mote.y), 1, 1);
    }
    [0.18, 0.47, 0.83].forEach((fx, i) => {
      const cycle = (t + i * 1300) % 3200;
      const x = this.W * fx, top = this.H * 0.12, floor = this.H * (0.62 + i * 0.05);
      if (cycle < 900) this.art.draw(ctx, "amb-drip", "drop", x, top + (floor - top) * (cycle / 900) ** 2);
      else if (cycle < 1400) this.art.draw(ctx, "amb-drip", this.art.pose("amb-drip", "splash", Math.floor((cycle - 900) / 170)), x, floor);
    });
  }

  private forest(ctx: CanvasRenderingContext2D, t: number): void {
    // Mist drifting near the ground.
    for (let band = 0; band < 2; band++) {
      const y0 = this.H * (0.58 + band * 0.12);
      for (let y = 0; y < 10; y++) {
        const offset = Math.sin((y + band * 5) * 0.8 + t / 2400) * 30 + (t / (90 + band * 40)) % this.W;
        ctx.fillStyle = `rgba(200, 215, 255, ${0.05 * Math.sin((y / 10) * Math.PI)})`;
        ctx.fillRect(Math.round(offset - this.W), Math.round(y0 + y), this.W * 2, 1);
      }
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const mote of this.motes) {
      const blink = 0.5 + 0.5 * Math.sin((t + mote.phase * 7) / 380);
      if (blink < 0.25) continue;
      const glow = ctx.createRadialGradient(mote.x, mote.y, 0, mote.x, mote.y, 5);
      glow.addColorStop(0, `rgba(210, 255, 120, ${0.5 * blink})`);
      glow.addColorStop(1, "rgba(210, 255, 120, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(mote.x - 5, mote.y - 5, 10, 10);
      ctx.fillStyle = "#f5ffb0";
      ctx.fillRect(Math.round(mote.x), Math.round(mote.y), 1, 1);
    }
    ctx.restore();
    for (let i = 0; i < 3; i++) {
      const fall = ((t / 1000) * 14 + i * 90) % (this.H + 40) - 20;
      this.art.draw(ctx, "amb-leaf", this.art.pose("amb-leaf", "fall", Math.floor(t / 180 + i) % 4), this.W * (0.2 + i * 0.3) + Math.sin(t / 800 + i) * 20, fall);
    }
  }
}
