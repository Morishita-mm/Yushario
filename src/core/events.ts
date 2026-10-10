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
  // Room fields (docs/OBSERVATION.md). Local display only: never sent to the Decider.
  agent?: string; // Session id; one character per session.
  name?: string; // Display name (last segment of the working directory).
  terminal?: string; // Embedded terminal session id.
  project?: string; // Repository name (shared by its worktrees).
  text?: string; // Prompt/final reply for local conversation display only.
  hook?: string; // Harness hook name, e.g. "PreToolUse".
  target?: string; // What the activity is about: file basename, command head, domain…
  subagent?: { id: string; type?: string };
  task?: { id: string; subject?: string; status: TaskStatus };
}

export type TaskStatus = "pending" | "in_progress" | "completed" | "deleted";
const TASK_STATUSES: readonly TaskStatus[] = ["pending", "in_progress", "completed", "deleted"];

export const MAX_EVENT_METADATA_LENGTH = 200;
export const MAX_EVENT_TEXT_LENGTH = 8000;

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

  if (value.text !== undefined && (typeof value.text !== "string" || value.text.length > MAX_EVENT_TEXT_LENGTH)) {
    return { ok: false, error: `text must be a string of at most ${MAX_EVENT_TEXT_LENGTH} characters` };
  }

  for (const field of ["source", "tool", "agent", "name", "hook", "target", "terminal", "project"] as const) {
    const metadata = value[field];
    if (metadata !== undefined) {
      if (typeof metadata !== "string") {
        return { ok: false, error: `${field} must be a string` };
      }
      if (metadata.length > MAX_EVENT_METADATA_LENGTH) {
        return { ok: false, error: `${field} must be at most ${MAX_EVENT_METADATA_LENGTH} characters` };
      }
    }
  }

  let subagent: AgentEvent["subagent"];
  if (value.subagent !== undefined) {
    const raw = value.subagent as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object" || !shortText(raw.id) || (raw.type !== undefined && !shortText(raw.type))) {
      return { ok: false, error: "subagent must be { id, type? } with short strings" };
    }
    subagent = { id: raw.id as string, ...(raw.type !== undefined ? { type: raw.type as string } : {}) };
  }
  let task: AgentEvent["task"];
  if (value.task !== undefined) {
    const raw = value.task as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object" || !shortText(raw.id)
      || (raw.subject !== undefined && !shortText(raw.subject))
      || !TASK_STATUSES.includes(raw.status as TaskStatus)) {
      return { ok: false, error: "task must be { id, subject?, status } with short strings" };
    }
    task = { id: raw.id as string, status: raw.status as TaskStatus,
      ...(raw.subject !== undefined ? { subject: raw.subject as string } : {}) };
  }

  const event: AgentEvent = { state: value.state as AgentState };
  if (value.detail !== undefined) event.detail = value.detail as string;
  if (value.ts !== undefined) event.ts = value.ts as number;
  if (value.source !== undefined) event.source = value.source as string;
  if (value.tool !== undefined) event.tool = value.tool as string;
  if (value.context !== undefined) event.context = value.context as number;
  for (const field of ["agent", "name", "hook", "target", "terminal", "project", "text"] as const) {
    if (value[field] !== undefined) event[field] = value[field] as string;
  }
  if (subagent) event.subagent = subagent;
  if (task) event.task = task;
  return { ok: true, event };
}

function shortText(value: unknown): boolean {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_EVENT_METADATA_LENGTH;
}

// The Decider (and so Jev) never sees conversation text, names, targets or tasks.
export function deciderEvent(event: AgentEvent): AgentEvent {
  const { state, detail, ts, source, tool, context } = event;
  return Object.fromEntries(Object.entries({ state, detail, ts, source, tool, context })
    .filter(([, value]) => value !== undefined)) as unknown as AgentEvent;
}
