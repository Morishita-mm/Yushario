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

  const event: AgentEvent = { state: value.state as AgentState };
  if (value.detail !== undefined) event.detail = value.detail as string;
  if (value.ts !== undefined) event.ts = value.ts as number;
  return { ok: true, event };
}
