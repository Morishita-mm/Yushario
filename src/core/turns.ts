import { toolActivity } from "./activity";
import type { AgentEvent } from "./events";

export type TalkReport = {
  kind: "chest" | "scroll" | "talk";
  files: string[];
  tests: { passed: number; failed: number };
  failures: number;
  tools: number;
  startedAt: number;
  endedAt: number;
  waitedMs?: number;
  mp?: { start: number; end: number };
};
export type TalkEntry = { at: number; from: "you" | "hero"; text: string; report?: TalkReport };

// Older contributions become totals, not an ever-growing list. Late hooks can
// correct only this recent window; older completed cards are left unchanged.
export const TURN_MARK_LIMIT = 256;
export const TURN_FILE_LIMIT = 256;
type Tool = { tools: number; failures: number; passed: number; failed: number; file?: string };
type Mark = { at: number; hook?: string; context?: number; tool?: Tool };
type Active = { report: TalkReport; mpStart?: number; waitingAt?: number };
type Cursor = { context?: number; active?: Active };
export type Turns = {
  marks: Mark[];
  foldedThrough: number;
  latestAt: number;
  prefix: Cursor;
  current: Cursor;
  updates: Map<number, TalkReport | undefined>;
};

export function emptyTurns(): Turns {
  return { marks: [], foldedThrough: -Infinity, latestAt: -Infinity, prefix: {}, current: {}, updates: new Map() };
}

function copyReport(report: TalkReport): TalkReport {
  return { ...report, files: [...report.files], tests: { ...report.tests } };
}
function copyCursor(cursor: Cursor): Cursor {
  return { ...cursor, ...(cursor.active ? { active: { ...cursor.active, report: copyReport(cursor.active.report) } } : {}) };
}

function toolMark(event: AgentEvent): Tool {
  const mark: Tool = { tools: event.hook === "PreToolUse" ? 1 : 0, failures: 0, passed: 0, failed: 0 };
  if (event.hook === "PreToolUse") return mark;
  const failed = event.state === "error";
  const activity = toolActivity(event.tool!, event.target);
  if (failed) mark.failures = 1;
  if (activity === "test" && failed) mark.failed = 1;
  else if (activity === "test" && event.hook === "PostToolUse") mark.passed = 1;
  if (activity === "edit" && event.hook === "PostToolUse" && !failed && event.target) mark.file = event.target;
  return mark;
}

function applyMark(cursor: Cursor, mark: Mark): { stopped: boolean; report?: TalkReport } {
  const { at, hook } = mark;
  if (mark.context !== undefined) cursor.context = mark.context;
  if (hook === "UserPromptSubmit") {
    cursor.active = { report: {
      kind: "talk", files: [], tests: { passed: 0, failed: 0 }, tools: 0, failures: 0, startedAt: at, endedAt: at,
    }, mpStart: cursor.context === undefined ? undefined : 1 - cursor.context };
  } else if (hook === "SessionStart") {
    delete cursor.active;
  } else if (cursor.active) {
    const active = cursor.active, report = active.report;
    if (active.waitingAt !== undefined) {
      report.waitedMs = (report.waitedMs ?? 0) + at - active.waitingAt;
      delete active.waitingAt;
    }
    if (hook === "PermissionRequest") {
      active.waitingAt = at;
      report.waitedMs ??= 0;
    }
    if (mark.tool) {
      const tool = mark.tool;
      report.tools += tool.tools; report.failures += tool.failures;
      report.tests.passed += tool.passed; report.tests.failed += tool.failed;
      if (tool.file && report.files.length < TURN_FILE_LIMIT && !report.files.includes(tool.file)) report.files.push(tool.file);
    }
  }
  const stopped = hook === "Stop" || hook === "StopFailure";
  if (!stopped) return { stopped: false };
  const active = cursor.active;
  delete cursor.active;
  if (!active) return { stopped: true };
  const report = copyReport(active.report);
  report.endedAt = at;
  report.kind = report.files.length ? "chest" : report.tools ? "scroll" : "talk";
  if (active.mpStart !== undefined && cursor.context !== undefined) report.mp = { start: active.mpStart, end: 1 - cursor.context };
  return { stopped: true, report };
}

export function recordTurn(turns: Turns, event: AgentEvent, at: number): void {
  turns.updates.clear();
  // We cannot safely put a hook before already folded totals.
  if (at < turns.foldedThrough) return;
  const mark: Mark = { at, hook: event.hook, context: event.context };
  if (event.tool && ["PreToolUse", "PostToolUse", "PostToolUseFailure"].includes(event.hook ?? "")) mark.tool = toolMark(event);
  const late = at < turns.latestAt;
  turns.marks.push(mark);
  if (late) turns.marks.sort((a, b) => a.at - b.at);
  if (turns.marks.length > TURN_MARK_LIMIT) {
    const oldest = turns.marks.shift()!;
    applyMark(turns.prefix, oldest);
    turns.foldedThrough = oldest.at;
  }
  if (!late) {
    // Normal hooks update only the ongoing round, in constant space and time.
    const result = applyMark(turns.current, mark);
    if (result.stopped) turns.updates.set(at, result.report);
  } else {
    // Concurrent command hooks may arrive late. Rebuild the bounded window and
    // refresh only replies at/after that hook, never every old completed card.
    turns.current = copyCursor(turns.prefix);
    for (const recent of turns.marks) {
      const result = applyMark(turns.current, recent);
      if (result.stopped && recent.at >= at) turns.updates.set(recent.at, result.report);
    }
  }
  turns.latestAt = Math.max(turns.latestAt, at);
}

// Keep existing card references: the UI can already be showing one of them.
export function attachReports(talk: TalkEntry[], turns: Turns): void {
  if (!turns.updates.size) return;
  for (const entry of talk) {
    if (entry.from !== "hero" || !turns.updates.has(entry.at)) continue;
    const report = turns.updates.get(entry.at);
    if (!report) delete entry.report;
    else if (entry.report) {
      delete entry.report.waitedMs;
      delete entry.report.mp;
      Object.assign(entry.report, report);
    } else entry.report = report;
  }
}
