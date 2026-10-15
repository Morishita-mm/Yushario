import { tr } from "./language";
import { isAbsolute } from "node:path";
import type { IPty } from "node-pty";
import type { WebSocket } from "ws";

import { PRESETS, type Preset } from "./agents";
import type { Equipment } from "../core/equipment";
import { updateModes, type TerminalModes } from "../core/terminal-modes";
export { PRESETS, type Preset } from "./agents";
export const SESSION_LIMIT = 16;
export const OUTPUT_LIMIT = 256 * 1024;

// Public session JSON: project is the town key, not its display name.
export type TerminalSession = {
  id: string; preset: Preset; cwd: string; project: string; projectName?: string; projectParent?: string; createdAt: number;
  branch?: string; hero?: string; recalledHero?: string;
  previewUrls?: string[];
  exited?: { code: number; at: number };
} & Equipment;

export type Session = {
  agentToken: string; info: TerminalSession; terminal: IPty; output: Buffer; modes: TerminalModes; clients: Set<WebSocket>; stop: () => void;
  waiting: boolean; eventAt: number; texts: string[]; enter?: ReturnType<typeof setTimeout>;
  interrupted: boolean; interrupting: boolean; departing: boolean; ended?: boolean;
  asking: boolean; askedAt: number; // A permission/question prompt that a typed Enter would answer.
  agentId?: string; hasPrompt: boolean; name: string; attention?: boolean;
  finished: Promise<void>; finish: () => void;
  pendingEquipment?: Equipment; equipping?: Equipment;
};
export type PendingMessage = { type: "pending"; terminal: string; texts: string[]; equipment?: Equipment };
export type EquippedMessage = { type: "equipped"; session: TerminalSession };

export function sessionInput(input: unknown): { preset: Preset; cwd?: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(tr("起動の設定を指定してください", "Choose launch settings"));
  const value = input as Record<string, unknown>;
  if (!PRESETS.includes(value.preset as Preset)) throw new Error(tr("勇者の種類が正しくありません", "Invalid hero kind"));
  if (value.cwd !== undefined && (typeof value.cwd !== "string" || !isAbsolute(value.cwd))) {
    throw new Error(tr("行き先はフォルダの絶対パスで指定してください", "Use an absolute folder path"));
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
// Modes set in the dropped part are kept in `modes` so a new window can restore them.
export function appendOutput(previous: Buffer, data: string, modes?: TerminalModes): Buffer {
  const bytes = Buffer.concat([previous, Buffer.from(data)]);
  let start = Math.max(0, bytes.length - OUTPUT_LIMIT);
  if (start > 0) {
    const newline = bytes.indexOf(0x0a, start);
    if (newline !== -1) start = newline + 1;
  }
  while (start < bytes.length && (bytes[start] & 0xc0) === 0x80) start++;
  if (modes && start > 0) updateModes(modes, bytes.subarray(0, start).toString("utf8"));
  return Buffer.from(bytes.subarray(start));
}
