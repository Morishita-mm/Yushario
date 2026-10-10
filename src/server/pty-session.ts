import { isAbsolute } from "node:path";
import type { IPty } from "node-pty";
import type { WebSocket } from "ws";

import { PRESETS, type Preset } from "./agents";
export { PRESETS, type Preset } from "./agents";
export const SESSION_LIMIT = 16;
export const OUTPUT_LIMIT = 256 * 1024;

export type TerminalSession = {
  id: string; preset: Preset; cwd: string; project: string; createdAt: number;
  exited?: { code: number };
};

export type Session = {
  info: TerminalSession; terminal: IPty; output: Buffer; clients: Set<WebSocket>; stop: () => void;
  waiting: boolean; eventAt: number; texts: string[]; enter?: ReturnType<typeof setTimeout>;
  interrupted: boolean; interrupting: boolean; departing: boolean; ended?: boolean;
  agentId?: string; hasPrompt: boolean; name: string; attention?: boolean;
  finished: Promise<void>; finish: () => void;
};
export type PendingMessage = { type: "pending"; terminal: string; texts: string[] };

export function sessionInput(input: unknown): { preset: Preset; cwd?: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("起動の設定を指定してください");
  const value = input as Record<string, unknown>;
  if (!PRESETS.includes(value.preset as Preset)) throw new Error("勇者の種類が正しくありません");
  if (value.cwd !== undefined && (typeof value.cwd !== "string" || !isAbsolute(value.cwd))) {
    throw new Error("行き先はフォルダの絶対パスで指定してください");
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
