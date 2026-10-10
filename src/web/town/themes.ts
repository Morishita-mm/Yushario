import type { Sheets } from "./sheets";

// The five kinds of town. Their component choices and placements live in bld-inn.town.
export type TownTheme = "village" | "port" | "snow" | "desert" | "volcano";
export const THEME_NAMES: Record<TownTheme, string> = {
  village: "草原の村", port: "海辺の港町", snow: "雪国の町", desert: "砂漠のオアシス", volcano: "火山の町",
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
      art.draw(ctx, "amb-gull", beat < 6 ? art.pose("amb-gull", "flap", Math.floor(beat) % 4) : "wings level", x, y, false);
    }
  } else {
    for (let i = 0; i < 3; i++) art.draw(ctx, "amb-butterfly", art.pose("amb-butterfly", i % 2 ? "white" : "yellow", Math.floor(t / 110) % 2), 480 + Math.sin(s / 1.6 + i * 2) * 330, 300 + Math.sin(s / 0.9 + i) * 140);
  }
}
