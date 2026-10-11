import { logoColors, logoPixels } from "./logo-pixels";

export function printStartupLogo(): void {
  const output = process.stdout;
  if (!output.isTTY || process.env.NO_COLOR !== undefined || process.env.TERM === "dumb" || !output.hasColors()) return;
  const depth = output.getColorDepth();
  // Respect 16/256-colour terminals rather than assuming truecolour support.
  const basic = [34, 37, 35, 97, 93, 96, 93, 31, 33];
  const colors = logoColors.map((hex, n) => {
    const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    if (depth >= 24) return [`38;2;${rgb.join(";")}`, `48;2;${rgb.join(";")}`];
    if (depth >= 8) {
      const [r, g, b] = rgb.map((value) => Math.round(value / 255 * 5));
      const index = 16 + 36 * r! + 6 * g! + b!;
      return [`38;5;${index}`, `48;5;${index}`];
    }
    const foreground = basic[n] ?? 37;
    return [String(foreground), String(foreground + 10)];
  });
  let text = "\n";
  for (let y = 0; y < logoPixels.length; y += 2) {
    let previous = "";
    for (let x = 0; x < logoPixels[y]!.length; x++) {
      const top = logoPixels[y]![x]!, bottom = logoPixels[y + 1]?.[x] ?? ".";
      const upper = top === "." ? undefined : colors[parseInt(top, 16)];
      const lower = bottom === "." ? undefined : colors[parseInt(bottom, 16)];
      const style = `${upper?.[0] ?? lower?.[0] ?? "39"};${upper && lower ? lower[1] : "49"}`;
      if (style !== previous) { text += `\x1b[${style}m`; previous = style; }
      text += upper ? "▀" : lower ? "▄" : " ";
    }
    text += "\x1b[0m\n";
  }
  output.write(`${text}\n`);
}
