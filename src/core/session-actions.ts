import { classifyActivity } from "./activity";
import type { AgentEvent } from "./events";

export type SessionAction = "interrupt" | "compact" | "farewell";

// Use the exit clock when available, so a delayed arrival check still recognizes an early exit.
export function earlyEquippedExit(session: { createdAt: number; exited?: { code: number; at?: number }; weapon?: string; accessory?: string }, now: number): boolean {
  const elapsed = (session.exited?.at ?? now) - session.createdAt;
  return Boolean(session.exited && (session.weapon || session.accessory) && elapsed >= 0 && elapsed <= 5000);
}

// A CLI can replace its conversation without ending the terminal (/new, resume, fork).
// Reload starts the same ID again and must not retire it.
export function replacedSession(event: AgentEvent, previous: string | undefined): string | undefined {
  return event.terminal && !event.subagent && event.hook === "SessionStart"
    && previous && event.agent && event.agent !== previous ? previous : undefined;
}

// TUIs can render spaces as cursor movements; compare the visible letters, not raw ANSI bytes.
export function hasTrustPrompt(output: string): boolean {
  const plain = output.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/\s+/g, "");
  return /(?:Doyoutrust(?:thefilesin)?thisfolder|Yes,Itrustthisfolder|Isthisaprojectyoucreatedoroneyoutrust\?|Trustprojectfolder\?)/i.test(plain);
}

// An old end is not a terminal boundary, even when no stop was requested.
export function staleSessionEnd(event: AgentEvent, at: number, latestAt: number | undefined): boolean {
  return event.hook === "SessionEnd" && !event.subagent && at < (latestAt ?? -Infinity);
}

// Esc is a request, not proof of a stop. Only a subsequent main ready/end hook confirms it.
export function stopRequestAfterEvent(current: number | undefined, event: AgentEvent, at: number): number | undefined {
  if (event.subagent || at < (current ?? -Infinity)) return current;
  if (event.hook === "Interrupt") return at;
  if (["SessionStart", "Stop", "StopFailure", "PostCompact", "SessionEnd", "InterruptConfirmed"].includes(event.hook ?? "")) return undefined;
  return current;
}

// Notifications and subagents cannot change the main conversation's readiness.
export function waitingAfterEvent(event: AgentEvent, interrupted = false): boolean | undefined {
  if (event.subagent) return;
  if (event.hook === "Interrupt") return false;
  if (["SessionStart", "Stop", "StopFailure", "PostCompact", "InterruptConfirmed"].includes(event.hook ?? "")) return true;
  if (["UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure", "PreCompact"].includes(event.hook ?? "")) {
    // Tool completion/failure hooks can arrive after Esc; only a new prompt starts work again.
    if (interrupted && event.hook !== "UserPromptSubmit") return;
    return false;
  }
}

// Whether the CLI shows a permission/question prompt, where a typed Enter would answer it.
// Helpers' prompts also block the terminal, but only the main conversation's next step clears one.
export function askingAfterEvent(event: AgentEvent): boolean | undefined {
  if (classifyActivity(event) === "ask") return true;
  if (event.subagent) return;
  if (classifyActivity(event) !== undefined || event.hook === "PostToolUse" || event.hook === "PostToolUseFailure") return false;
}
