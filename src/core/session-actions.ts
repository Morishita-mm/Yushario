import type { AgentEvent } from "./events";

export type SessionAction = "interrupt" | "compact" | "farewell";

// Notifications and subagents cannot change the main conversation's readiness.
export function waitingAfterEvent(event: AgentEvent, interrupted = false): boolean | undefined {
  if (event.subagent) return;
  if (["SessionStart", "Stop", "StopFailure", "PostCompact", "Interrupt"].includes(event.hook ?? "")) return true;
  if (["UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure", "PreCompact"].includes(event.hook ?? "")) {
    // Tool completion/failure hooks can arrive after Esc; only a new prompt starts work again.
    if (interrupted && event.hook !== "UserPromptSubmit") return;
    return false;
  }
}
