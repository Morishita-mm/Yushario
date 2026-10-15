import { parseAgentEvent, type AgentEvent } from "../../core/events";
import type { Permission } from "./hud";

export function parseRelayEvent(input: unknown, at: unknown): { event: AgentEvent; at: number } | undefined {
  const result = parseAgentEvent(input);
  if (result.ok && typeof at === "number" && Number.isFinite(at)) return { event: result.event, at };
}

export function parsePermission(value: Record<string, unknown>): Permission | undefined {
  if (typeof value.id !== "string" || typeof value.tool !== "string" || typeof value.summary !== "string"
    || typeof value.content !== "string" || typeof value.omitted !== "number" || typeof value.expiresAt !== "number") return;
  return { id: value.id, tool: value.tool, summary: value.summary, content: value.content, omitted: value.omitted, expiresAt: value.expiresAt,
    ...(typeof value.agent === "string" ? { agent: value.agent } : {}),
    ...(typeof value.helper === "string" ? { helper: value.helper } : {}) };
}
