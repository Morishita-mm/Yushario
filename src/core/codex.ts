import { parseAgentEvent, type AgentEvent } from "./events";

// Codex 0.162.1: developers.openai.com/codex/hooks and its generated input schemas.
export const CODEX_HOOKS = ["SessionStart", "SessionEnd", "UserPromptSubmit", "PreToolUse", "PostToolUse",
  "PermissionRequest", "Stop", "Interrupt", "PreCompact", "PostCompact"] as const;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function commandHead(command: string): string | undefined {
  // Display only plain command words, not arguments containing paths or shell syntax.
  const words = command.trim().split(/\s+/), head: string[] = [];
  for (const word of words.slice(0, 3)) {
    if (!/^[A-Za-z0-9._:@+-]+$/.test(word)) break;
    head.push(word);
  }
  return head.join(" ") || undefined;
}

export function codexEvent(input: unknown, environment: { terminal?: string; project?: string }, at: number): AgentEvent | undefined {
  const hook = record(input), name = hook.hook_event_name;
  if (typeof name !== "string" || !CODEX_HOOKS.includes(name as typeof CODEX_HOOKS[number])
    || typeof hook.session_id !== "string" || !hook.session_id) return;
  const states: Record<string, AgentEvent["state"]> = {
    SessionStart: "idle", SessionEnd: "idle", UserPromptSubmit: "thinking", PreToolUse: "working",
    PostToolUse: "working", PermissionRequest: "waiting_input", Stop: "success", Interrupt: "idle",
    PreCompact: "working", PostCompact: "idle",
  };
  const event: AgentEvent = { source: "codex", agent: hook.session_id, hook: name, state: states[name], ts: at,
    terminal: environment.terminal, project: environment.project };
  if (typeof hook.cwd === "string") event.name = hook.cwd.split(/[\\/]/).filter(Boolean).pop();
  if (["PreToolUse", "PostToolUse", "PermissionRequest"].includes(name) && typeof hook.tool_name === "string") {
    event.tool = hook.tool_name;
    const command = record(hook.tool_input).command;
    if (event.tool === "Bash" && typeof command === "string") event.target = commandHead(command);
    // tool_response is arbitrary JSON (often raw stdout), NOT a documented exit status.
    // Never parse its text, forward output, or send a completed command as check evidence.
    if (name === "PostToolUse") event.detail = "Tool finished; result unknown";
  }
  // Yushario's Interrupt means a request. Codex's hook confirms interruption instead.
  if (name === "Interrupt") { event.hook = "InterruptConfirmed"; event.detail = "Interrupted"; }
  const body = name === "UserPromptSubmit" ? hook.prompt : name === "Stop" ? hook.last_assistant_message : undefined;
  if (typeof body === "string") event.text = body;
  // SessionStart after automatic compaction is not a new conversation or an idle turn.
  if (name === "SessionStart" && hook.source === "compact") return;
  // Auto-compaction is inside an active turn; it must not flush held requests as idle.
  if (["PreCompact", "PostCompact"].includes(name) && hook.trigger === "auto") return;
  const parsed = parseAgentEvent(event);
  return parsed.ok ? parsed.event : undefined;
}
