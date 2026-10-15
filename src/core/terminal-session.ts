export const OUTPUT_LIMIT = 256 * 1024;

type SessionInputResult = { ok: true; preset: string; cwd?: string } | { ok: false; reason: "settings" | "preset" | "cwd" };

// The server supplies its existing agent catalogue; filesystem path semantics stay there.
export function sessionInputFields(input: unknown, presets: readonly string[]): SessionInputResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, reason: "settings" };
  const value = input as Record<string, unknown>;
  if (typeof value.preset !== "string" || !presets.includes(value.preset)) return { ok: false, reason: "preset" };
  if (value.cwd !== undefined && typeof value.cwd !== "string") return { ok: false, reason: "cwd" };
  return { ok: true, preset: value.preset, ...(value.cwd !== undefined ? { cwd: value.cwd as string } : {}) };
}

export function dimensions(cols: unknown, rows: unknown): { cols: number; rows: number } | undefined {
  if (typeof cols !== "number" || typeof rows !== "number" || !Number.isInteger(cols)
    || !Number.isInteger(rows) || cols < 2 || cols > 500 || rows < 2 || rows > 300) return;
  return { cols, rows };
}

// Skip an overflowed partial line/ANSI sequence, then any partial UTF-8 character.
// Byte encoding/decoding and mode restoration remain at the server boundary.
export function outputStart(bytes: Uint8Array): number {
  let start = Math.max(0, bytes.length - OUTPUT_LIMIT);
  if (start > 0) {
    const newline = bytes.indexOf(0x0a, start);
    if (newline !== -1) start = newline + 1;
  }
  while (start < bytes.length && (bytes[start] & 0xc0) === 0x80) start++;
  return start;
}
