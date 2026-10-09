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
}

export const MAX_EVENT_METADATA_LENGTH = 200;

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

  for (const field of ["source", "tool"] as const) {
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

  const event: AgentEvent = { state: value.state as AgentState };
  if (value.detail !== undefined) event.detail = value.detail as string;
  if (value.ts !== undefined) event.ts = value.ts as number;
  if (value.source !== undefined) event.source = value.source as string;
  if (value.tool !== undefined) event.tool = value.tool as string;
  if (value.context !== undefined) event.context = value.context as number;
  return { ok: true, event };
}
