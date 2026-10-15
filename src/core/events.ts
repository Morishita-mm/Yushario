export type AgentState =
  | "idle"
  | "thinking"
  | "working"
  | "waiting_input"
  | "success"
  | "error";

export interface AgentEvent {
  state: AgentState;
  detail?: string;
  ts?: number;
  source?: string;
  tool?: string;
  context?: number; // Context window usage, when known (0–1).
  // Room and local quest ledger fields (docs/OBSERVATION.md).
  agent?: string; // Session id; one character per session.
  name?: string; // Display name (last segment of the working directory).
  terminal?: string; // Embedded terminal session id.
  project?: string; // Town key, not a display name (shared by its worktrees).
  branch?: string; // Local branch, for the base's name badge.
  text?: string; // Local prompt/final reply; ledger body saved only when opted in.
  hook?: string; // Harness hook name, e.g. "PreToolUse".
  target?: string; // What the activity is about: file basename, command head, domain…
  command?: string; // Completed command input, transient until check matching; never replayed.
  subagent?: { id: string; type?: string };
  task?: { id: string; subject?: string; status: TaskStatus };
}

export type TaskStatus = "pending" | "in_progress" | "completed" | "deleted";
const TASK_STATUSES: readonly TaskStatus[] = ["pending", "in_progress", "completed", "deleted"];

export const MAX_EVENT_METADATA_LENGTH = 200;
export const MAX_EVENT_TEXT_LENGTH = 8000;
export const MAX_PROJECT_KEY_LENGTH = 4096; // Canonical repository paths must not collide at 200 characters.

// Count UTF-16 units, as the UI does, without leaving a split surrogate pair.
export function truncateEventString(value: string, limit: number): string {
  const clipped = value.slice(0, limit);
  return clipped.length < value.length && /[\uD800-\uDBFF]$/.test(clipped) ? clipped.slice(0, -1) : clipped;
}

const STATES: readonly AgentState[] = [
  "idle", "thinking", "working", "waiting_input", "success", "error",
];

export function parseAgentEvent(
  input: unknown,
): { ok: true; event: AgentEvent } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "Event must be an object" };
  }
  const value = input as Record<string, unknown>;
  if (typeof value.state !== "string" || !STATES.includes(value.state as AgentState)) {
    return { ok: false, error: "Unknown or missing state" };
  }
  if (value.detail !== undefined && typeof value.detail !== "string") {
    return { ok: false, error: "detail must be a string" };
  }
  if (value.ts !== undefined && (typeof value.ts !== "number" || !Number.isFinite(value.ts))) {
    return { ok: false, error: "ts must be a finite number" };
  }

  if (value.context !== undefined && (typeof value.context !== "number"
    || !Number.isFinite(value.context) || value.context < 0 || value.context > 1)) {
    return { ok: false, error: "context must be a finite number between 0 and 1" };
  }

  if (value.text !== undefined && typeof value.text !== "string") {
    return { ok: false, error: "text must be a string" };
  }

  for (const field of ["source", "tool", "agent", "name", "hook", "target", "terminal", "project", "branch"] as const) {
    const metadata = value[field];
    if (metadata !== undefined) {
      if (typeof metadata !== "string") {
        return { ok: false, error: `${field} must be a string` };
      }
    }
  }

  let subagent: AgentEvent["subagent"];
  if (value.subagent !== undefined) {
    const raw = value.subagent as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object" || !shortText(raw.id) || (raw.type !== undefined && !shortText(raw.type))) {
      return { ok: false, error: "subagent must be { id, type? } with short strings" };
    }
    subagent = { id: truncateEventString(raw.id as string, MAX_EVENT_METADATA_LENGTH),
      ...(raw.type !== undefined ? { type: truncateEventString(raw.type as string, MAX_EVENT_METADATA_LENGTH) } : {}) };
  }
  let task: AgentEvent["task"];
  if (value.task !== undefined) {
    const raw = value.task as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object" || !shortText(raw.id)
      || (raw.subject !== undefined && !shortText(raw.subject))
      || !TASK_STATUSES.includes(raw.status as TaskStatus)) {
      return { ok: false, error: "task must be { id, subject?, status } with short strings" };
    }
    task = { id: truncateEventString(raw.id as string, MAX_EVENT_METADATA_LENGTH), status: raw.status as TaskStatus,
      ...(raw.subject !== undefined ? { subject: truncateEventString(raw.subject as string, MAX_EVENT_METADATA_LENGTH) } : {}) };
  }

  const rawCommand = value.command ?? (value.tool_input && typeof value.tool_input === "object" ? (value.tool_input as Record<string, unknown>).command : undefined);
  if (rawCommand !== undefined && typeof rawCommand !== "string") return { ok: false, error: "command must be a string" };
  const event: AgentEvent = { state: value.state as AgentState };
  if (typeof rawCommand === "string" && value.tool === "Bash" && ["PostToolUse", "PostToolUseFailure"].includes(String(value.hook))) {
    event.command = truncateEventString(rawCommand, MAX_EVENT_TEXT_LENGTH);
    if (value.target === undefined) event.target = truncateEventString(rawCommand, MAX_EVENT_METADATA_LENGTH);
  }
  if (value.ts !== undefined) event.ts = value.ts as number;
  if (value.context !== undefined) event.context = value.context as number;
  for (const field of ["detail", "source", "tool", "agent", "name", "hook", "target", "terminal", "project", "branch", "text"] as const) {
    if (value[field] !== undefined) event[field] = truncateEventString(value[field] as string,
      field === "text" ? MAX_EVENT_TEXT_LENGTH : field === "project" ? MAX_PROJECT_KEY_LENGTH : MAX_EVENT_METADATA_LENGTH);
  }
  if (subagent) event.subagent = subagent;
  if (task) event.task = task;
  return { ok: true, event };
}

function shortText(value: unknown): boolean {
  return typeof value === "string" && value.length > 0;
}
