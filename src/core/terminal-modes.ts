// Terminal modes that a full-screen CLI turns on once at startup (alternate screen, mouse
// reporting, bracketed paste...). The server keeps only the tail of the output, so it
// remembers these from the dropped part and replays them first.
const DEFAULTS = new Map<number, boolean>([
  [1049, false], [1047, false], [47, false], // Alternate screen first: it clears and saves the cursor.
  [1, false], [7, true], [25, true],
  [1000, false], [1002, false], [1003, false], [1004, false], [1005, false], [1006, false], [1015, false],
  [2004, false],
]);

export type TerminalModes = Map<number, boolean>;

export function updateModes(modes: TerminalModes, text: string): void {
  for (const [, list, flag] of text.matchAll(/\x1b\[\?([\d;]+)([hl])/g)) {
    for (const value of list.split(";")) {
      const mode = Number(value);
      if (DEFAULTS.has(mode)) modes.set(mode, flag === "h");
    }
  }
}

export function modePrefix(modes: TerminalModes): string {
  let prefix = "";
  for (const [mode, fallback] of DEFAULTS) {
    const value = modes.get(mode) ?? fallback;
    if (value !== fallback) prefix += `\x1b[?${mode}${value ? "h" : "l"}`;
  }
  return prefix;
}
