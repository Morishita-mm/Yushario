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
