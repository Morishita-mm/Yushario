import { isAbsolute } from "node:path";

export const PRESETS = ["shell", "claude", "pi", "codex"] as const;
export const SESSION_LIMIT = 16;
export const OUTPUT_LIMIT = 256 * 1024;

export type Preset = typeof PRESETS[number];
export type TerminalSession = {
  id: string; preset: Preset; cwd: string; project: string; createdAt: number;
  exited?: { code: number };
};

export function sessionInput(input: unknown): { preset: Preset; cwd?: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Session must be an object");
  const value = input as Record<string, unknown>;
  if (!PRESETS.includes(value.preset as Preset)) throw new Error("Unknown preset");
  if (value.cwd !== undefined && (typeof value.cwd !== "string" || !isAbsolute(value.cwd))) {
    throw new Error("cwd must be an absolute directory path");
  }
  return { preset: value.preset as Preset, ...(value.cwd !== undefined ? { cwd: value.cwd as string } : {}) };
}

export function dimensions(cols: unknown, rows: unknown): { cols: number; rows: number } | undefined {
  if (typeof cols !== "number" || typeof rows !== "number" || !Number.isInteger(cols)
    || !Number.isInteger(rows) || cols < 2 || cols > 500 || rows < 2 || rows > 300) return;
  return { cols, rows };
}

// On overflow, drop the partial first line (which may contain a split ANSI sequence).
// If there is no newline, keep the byte limit and skip a partial UTF-8 character.
export function appendOutput(previous: Buffer, data: string): Buffer {
  const bytes = Buffer.concat([previous, Buffer.from(data)]);
  let start = Math.max(0, bytes.length - OUTPUT_LIMIT);
  if (start > 0) {
    const newline = bytes.indexOf(0x0a, start);
    if (newline !== -1) start = newline + 1;
  }
  while (start < bytes.length && (bytes[start] & 0xc0) === 0x80) start++;
  return Buffer.from(bytes.subarray(start));
}
