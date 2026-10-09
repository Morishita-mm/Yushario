import type { Sheets } from "./sheets";

// The five kinds of town. A project (repository) gets one, so every project has a recognisable home.
export type TownTheme = "village" | "port" | "snow" | "desert" | "volcano";
export const THEME_NAMES: Record<TownTheme, string> = {
  village: "草原の村", port: "海辺の港町", snow: "雪国の町", desert: "砂漠のオアシス", volcano: "火山の町",
};

type Part = [string, number];
export interface Look {
  ground: Part;
  street: Part;
  canal?: Part; // texture for the band across the town (water, ice, lava)
  inn: Part; shop: Part; church: Part; library: Part; houses: [Part, Part];
  centre: [string, number[]]; // plaza centrepiece and its animation frames
  trees: Part[];
  lamp: Part;
  extras: [string, number, number, number][]; // id, frame, x, y
  tint?: string;
}

export const LOOKS: Record<TownTheme, Look> = {
  village: {
    ground: ["tile-ground", 0], street: ["tile-ground", 2], canal: ["obj-canal", 0],
    inn: ["bld-inn", 0], shop: ["bld-shop", 0], church: ["bld-church", 0], library: ["bld-library", 0], houses: [["bld-house", 0], ["bld-house", 1]],
    centre: ["obj-fountain", [0, 1, 2]], trees: [["obj-nature", 0], ["obj-nature", 1]], lamp: ["obj-town", 4],
    extras: [["obj-town", 0, 92, 472], ["obj-town", 6, 222, 444], ["obj-town", 7, 880, 472], ["obj-town", 5, 742, 456], ["obj-town", 1, 196, 344], ["obj-town", 2, 812, 344]],
  },
  port: {
    ground: ["tile-port", 0], street: ["tile-port", 2], canal: ["tile-port", 3],
    inn: ["bld-port", 0], shop: ["bld-port", 1], church: ["bld-port", 2], library: ["bld-port", 4], houses: [["bld-port", 3], ["bld-port", 3]],
    centre: ["obj-fountain", [0, 1, 2]], trees: [["obj-desert", 0], ["obj-nature", 0]], lamp: ["obj-town", 4],
    extras: [["obj-port", 0, 60, 300], ["obj-port", 1, 120, 250], ["obj-port", 2, 812, 350], ["obj-port", 4, 230, 450], ["obj-port", 3, 900, 260], ["obj-town", 1, 196, 344]],
  },
  snow: {
    ground: ["tile-snow", 0], street: ["tile-snow", 1], canal: ["tile-snow", 2],
    inn: ["bld-snow", 0], shop: ["bld-snow", 1], church: ["bld-snow", 2], library: ["bld-snow", 4], houses: [["bld-snow", 3], ["bld-snow", 3]],
    centre: ["obj-snow", [2]], trees: [["obj-snow", 0], ["obj-snow", 0]], lamp: ["obj-snow", 3],
    extras: [["obj-snow", 1, 230, 450], ["obj-snow", 4, 880, 472], ["obj-snow", 5, 92, 472], ["obj-town", 6, 812, 350]],
  },
  desert: {
    ground: ["tile-desert", 0], street: ["tile-desert", 1],
    inn: ["bld-desert", 0], shop: ["bld-desert", 1], church: ["bld-desert", 2], library: ["bld-desert", 4], houses: [["bld-desert", 3], ["bld-desert", 3]],
    centre: ["obj-desert", [1]], trees: [["obj-desert", 0], ["obj-desert", 5]], lamp: ["obj-town", 4],
    extras: [["obj-desert", 2, 600, 505], ["obj-desert", 3, 812, 350], ["obj-desert", 4, 196, 344], ["obj-desert", 4, 230, 450], ["obj-desert", 5, 880, 472]],
  },
  volcano: {
    ground: ["tile-volcano", 0], street: ["tile-volcano", 1],
    inn: ["bld-volcano", 0], shop: ["bld-volcano", 1], church: ["bld-volcano", 2], library: ["bld-volcano", 4], houses: [["bld-volcano", 3], ["bld-volcano", 3]],
    centre: ["obj-volcano", [3]], trees: [["obj-volcano", 4], ["obj-volcano", 2]], lamp: ["obj-volcano", 5],
    extras: [["obj-volcano", 0, 120, 250], ["obj-volcano", 0, 860, 250], ["obj-volcano", 1, 230, 450], ["obj-volcano", 1, 880, 472], ["obj-volcano", 2, 92, 472]],
    tint: "rgba(120, 30, 10, 0.12)",
  },
};

interface Mote { x: number; y: number; speed: number; drift: number; phase: number }
const motes: Mote[] = Array.from({ length: 70 }, (_, i) => ({
  x: (i * 137) % 960, y: (i * 89) % 540, speed: 12 + (i % 7) * 4, drift: ((i % 5) - 2) * 3, phase: i * 0.7,
}));

// Weather and life on top of a town: snowfall, embers, blowing sand, gulls, butterflies.
export function drawWeather(ctx: CanvasRenderingContext2D, art: Sheets, theme: TownTheme, t: number): void {
  const s = t / 1000;
  if (theme === "snow") {
    ctx.fillStyle = "#ffffff";
    for (const m of motes) {
      const x = (m.x + Math.sin(s + m.phase) * 12 + s * m.drift) % 960, y = (m.y + s * m.speed) % 540;
      ctx.fillRect(Math.round((x + 960) % 960), Math.round(y), m.speed > 30 ? 2 : 1, m.speed > 30 ? 2 : 1);
    }
  } else if (theme === "volcano") {
    for (const m of motes) {
      const y = 540 - ((m.y + s * m.speed * 1.5) % 560), x = (m.x + Math.sin(s * 2 + m.phase) * 8) % 960;
      ctx.fillStyle = (m.phase * 10) % 3 < 1 ? "#ffd35a" : "#ff7b2e";
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  } else if (theme === "desert") {
    ctx.fillStyle = "rgba(240, 210, 150, 0.6)";
    for (const m of motes.slice(0, 40)) {
      const x = (m.x + s * (40 + m.speed * 2)) % 980 - 10, y = (m.y + Math.sin(s * 3 + m.phase) * 4) % 540;
      ctx.fillRect(Math.round(x), Math.round(y), 2, 1);
    }
  } else if (theme === "port") {
    // Gulls flap a few times, then glide; each flies its own lazy wave across the harbour.
    for (let i = 0; i < 3; i++) {
      const x = (s * (30 + i * 12) + i * 300) % 1100 - 70, y = 70 + i * 50 + Math.sin(s * 1.5 + i) * 14;
      const beat = (t / 140 + i * 5) % 12;
      art.draw(ctx, "amb-gull", beat < 6 ? [0, 1, 2, 1][Math.floor(beat) % 4] : 1, x, y, false);
    }
  } else {
    for (let i = 0; i < 3; i++) art.draw(ctx, "amb-butterfly", (i % 2) * 2 + (Math.floor(t / 110) % 2), 480 + Math.sin(s / 1.6 + i * 2) * 330, 300 + Math.sin(s / 0.9 + i) * 140);
  }
}
