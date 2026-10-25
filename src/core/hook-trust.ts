import type { AgentEvent } from "./events";

export const EXTERNAL_AGENT_LIMIT = 32;
export const EXTERNAL_EVENT_LIMIT = 30;
export const EXTERNAL_EVENT_WINDOW_MS = 1000;
export type ExternalEventBudget = { agents: readonly string[]; startedAt: number; count: number };

// One server-wide budget, not one per claimed identity/IP. Keep admitted IDs until
// restart: recycling slots on SessionEnd would grow UI name/lifecycle histories.
// `now` is the server receipt time, never the hook's claimed timestamp.
export function admitExternalEvent(previous: ExternalEventBudget | undefined, agent: string, now: number): ExternalEventBudget | undefined {
  const agents = previous?.agents ?? [];
  const known = agents.includes(agent);
  if (!known && agents.length >= EXTERNAL_AGENT_LIMIT) return;
  const fresh = !previous || now - previous.startedAt >= EXTERNAL_EVENT_WINDOW_MS;
  const count = fresh ? 0 : previous.count;
  if (count >= EXTERNAL_EVENT_LIMIT) return;
  return { agents: known ? agents : [...agents, agent], startedAt: fresh ? now : previous.startedAt, count: count + 1 };
}

// Unauthenticated observations may be drawn, but cannot name an app terminal or
// share a hero ID with its authenticated history. Full commands are evidence-only.
export function hookEventForTerminal(event: AgentEvent, terminal?: string): AgentEvent {
  if (terminal) return { ...event, terminal };
  const { terminal: _terminal, command: _command, branch: _branch, ...visible } = event;
  return { ...visible, agent: `external:${event.agent ?? event.source ?? "unknown"}` };
}

export function canRecallHero(recalledHero: string | undefined, reportedHero: string | undefined, previousTerminalEnded: boolean): boolean {
  return Boolean(recalledHero && recalledHero === reportedHero && previousTerminalEnded);
}
