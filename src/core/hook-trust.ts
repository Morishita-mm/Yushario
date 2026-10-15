import type { AgentEvent } from "./events";

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
