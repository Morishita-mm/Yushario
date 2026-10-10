import { toolActivity } from "./activity";
import type { AgentEvent } from "./events";

// One round of the conversation: your prompt → the agent's work → its final reply (docs/PLATFORM.md 段階3.5).
export type TalkReport = {
  kind: "chest" | "scroll" | "talk";
  files: string[];
  tests: { passed: number; failed: number };
  failures: number;
  tools: number;
  startedAt: number;
  endedAt: number;
  mp?: { start: number; end: number };
};
export type TalkEntry = { at: number; from: "you" | "hero"; text: string; report?: TalkReport };

// Main-session marks, kept by event time. Hooks arrive out of order, so reports are always
// recomputed from these instead of being built up in arrival order.
type Tool = { at: number; tools: number; failures: number; passed: number; failed: number; file?: string };
export type Turns = {
  prompts: number[]; stops: number[]; sessions: number[]; tools: Tool[]; contexts: { at: number; value: number }[];
};

export function emptyTurns(): Turns {
  return { prompts: [], stops: [], sessions: [], tools: [], contexts: [] };
}

export function recordTurn(turns: Turns, event: AgentEvent, at: number): void {
  if (event.context !== undefined) turns.contexts.push({ at, value: event.context });
  if (event.hook === "UserPromptSubmit") turns.prompts.push(at);
  else if (event.hook === "Stop" || event.hook === "StopFailure") turns.stops.push(at);
  else if (event.hook === "SessionStart") turns.sessions.push(at);
  else if (event.tool && ["PreToolUse", "PostToolUse", "PostToolUseFailure"].includes(event.hook ?? "")) {
    turns.tools.push(toolMark(event, at));
  }
}

function toolMark(event: AgentEvent, at: number): Tool {
  // Count each tool once, at its start; outcomes come from the completion.
  const mark: Tool = { at, tools: event.hook === "PreToolUse" ? 1 : 0, failures: 0, passed: 0, failed: 0 };
  if (event.hook === "PreToolUse") return mark;
  const failed = event.state === "error";
  const activity = toolActivity(event.tool!, event.target);
  if (failed) mark.failures = 1;
  if (activity === "test" && failed) mark.failed = 1;
  else if (activity === "test" && event.hook === "PostToolUse") mark.passed = 1;
  // Interrupted (PostToolUseFailure without error) and failed edits did not change the file.
  if (activity === "edit" && event.hook === "PostToolUse" && !failed && event.target) mark.file = event.target;
  return mark;
}

const latest = (times: number[], end: number) => times.reduce((best, at) => at <= end && at > best ? at : best, -Infinity);
function contextAt(turns: Turns, at: number): { at: number; value: number } | undefined {
  let found: { at: number; value: number } | undefined;
  for (const context of turns.contexts) if (context.at <= at && (!found || context.at >= found.at)) found = context;
  return found;
}
const mpAt = (turns: Turns, at: number) => {
  const context = contextAt(turns, at);
  return context && 1 - context.value;
};

// The round a reply at `end` closes, if its prompt was seen and nothing else ended or reset it.
function reportFor(turns: Turns, end: number): TalkReport | undefined {
  const start = latest(turns.prompts, end);
  if (start === -Infinity) return;
  if (turns.stops.some((at) => at >= start && at < end) || turns.sessions.some((at) => at > start && at <= end)) return;
  const report: TalkReport = {
    kind: "talk", files: [], tests: { passed: 0, failed: 0 }, failures: 0, tools: 0, startedAt: start, endedAt: end,
  };
  for (const tool of turns.tools) {
    if (tool.at < start || tool.at > end) continue;
    report.tools += tool.tools; report.failures += tool.failures;
    report.tests.passed += tool.passed; report.tests.failed += tool.failed;
    if (tool.file && !report.files.includes(tool.file)) report.files.push(tool.file);
  }
  report.kind = report.files.length ? "chest" : report.tools ? "scroll" : "talk";
  const mpStart = mpAt(turns, start), mpEnd = mpAt(turns, end);
  if (mpStart !== undefined && mpEnd !== undefined) report.mp = { start: mpStart, end: mpEnd };
  return report;
}

// Refresh every reply's report in place (the screen keeps references to shown reports).
export function attachReports(talk: TalkEntry[], turns: Turns): void {
  for (const entry of talk) {
    if (entry.from !== "hero") continue;
    const report = reportFor(turns, entry.at);
    if (!report) delete entry.report;
    else if (entry.report) Object.assign(entry.report, report);
    else entry.report = report;
  }
}

// Forget marks older than the round of the oldest kept message.
export function pruneTurns(turns: Turns, oldest: number): void {
  const from = Math.min(oldest, latest(turns.prompts, oldest)), keep = (at: number) => at >= from;
  if (from === -Infinity) return;
  turns.prompts = turns.prompts.filter(keep);
  turns.stops = turns.stops.filter(keep);
  turns.sessions = turns.sessions.filter(keep);
  turns.tools = turns.tools.filter((tool) => keep(tool.at));
  const before = contextAt(turns, from - 1); // still the MP at the start of the oldest round
  turns.contexts = [...(before ? [before] : []), ...turns.contexts.filter((context) => keep(context.at))];
}
