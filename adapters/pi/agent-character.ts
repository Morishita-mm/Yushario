import { basename } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "./types";
import type { AgentEvent, AgentState } from "../../src/core/events";
import { projectName } from "../../src/server/project";

const tools: Record<string, string> = { read: "Read", edit: "Edit", write: "Write", bash: "Bash",
  powershell: "Bash", grep: "Grep", find: "Glob", ls: "LS" };

// Short display targets and completed command input for local checks; never tool output.
function target(input: Record<string, unknown>): string | undefined {
  if (typeof input.path === "string") return basename(input.path).slice(0, 200);
  if (typeof input.command !== "string") return;
  const segments = input.command.split(/&&|\|\||;|\||\n/).map((part) => part.trim().split(/\s+/));
  const words = segments.find((part) => part[0] && part[0] !== "cd") ?? [];
  while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0] ?? "")) words.shift();
  const head: string[] = [];
  for (const [index, word] of words.slice(0, 3).entries()) {
    if (index === 0 && /^[A-Za-z0-9._/@+-]+$/.test(word)) head.push(basename(word));
    else if (/^[A-Za-z0-9._:@+-]+$/.test(word)) head.push(word);
    else break;
  }
  return head.join(" ").slice(0, 200) || undefined;
}

// Lifecycle contracts: pi docs/extensions.md and dist/core/extensions/types.d.ts.
// Network failures are silent, bounded to 500ms, and never block a Pi handler.
export default function (pi: ExtensionAPI): void {
  let project: Promise<string> = Promise.resolve("");
  let reply = "";
  let outcome: "Stop" | "StopFailure" | "Interrupt" = "Stop";
  let active = false;
  let runSignal: AbortSignal | undefined;
  function send(ctx: ExtensionContext, hook: string, state: AgentState, extra: Partial<AgentEvent> = {}): Promise<void> {
    try {
      let percent: number | null | undefined;
      try { percent = ctx.getContextUsage()?.percent; } catch { /* Usage may be unknown. */ }
      const event: AgentEvent = { state, hook, source: "pi", ts: Date.now(),
        agent: ctx.sessionManager.getSessionId().slice(0, 200), name: (basename(ctx.cwd) || "root").slice(0, 200),
        terminal: process.env.AGENT_CHARACTER_SESSION?.slice(0, 200), ...extra };
      if (typeof percent === "number" && Number.isFinite(percent) && percent >= 0) event.context = Math.min(1, percent / 100);
      return project.then((name) => fetch(process.env.AGENT_CHARACTER_URL ?? "http://127.0.0.1:8790/event", {
        method: "POST", headers: { "Content-Type": "application/json", ...(process.env.AGENT_CHARACTER_AGENT_TOKEN
          ? { Authorization: `Bearer ${process.env.AGENT_CHARACTER_AGENT_TOKEN}` } : {}) },
        body: JSON.stringify({ ...event, project: name.slice(0, 200) }),
        signal: AbortSignal.timeout(500), redirect: "error",
      })).then(async (response) => { await response.body?.cancel(); }).catch(() => {});
    } catch { /* Missing relay/session must never interfere with Pi. */ return Promise.resolve(); }
  }
  pi.on("session_start", (_event, ctx) => {
    project = projectName(ctx.cwd);
    send(ctx, "SessionStart", "idle");
  });
  pi.on("before_agent_start", (event, ctx) => {
    reply = ""; outcome = "Stop"; runSignal = undefined;
    send(ctx, "UserPromptSubmit", "thinking", { text: event.prompt.slice(0, 8000) });
  });
  // Input typed during a run steers it (Claude Code reports the same as UserPromptSubmit).
  pi.on("input", (event, ctx) => {
    if (event.streamingBehavior === "steer") send(ctx, "UserPromptSubmit", "thinking", { text: event.text.slice(0, 8000) });
  });
  pi.on("agent_start", (_event, ctx) => { active = true; runSignal = ctx.signal; });
  // agent_start can precede creation of the operation signal; capture it inside the run.
  pi.on("before_provider_request", (_event, ctx) => { runSignal = ctx.signal; });
  pi.on("tool_call", (event, ctx) => {
    send(ctx, "PreToolUse", "working", { tool: (tools[event.toolName] ?? event.toolName).slice(0, 200), target: target(event.input) });
  });
  pi.on("tool_result", (event, ctx) => {
    const aborted = ctx.signal?.aborted === true;
    if (aborted) runSignal = ctx.signal; // Some pi versions settle an aborted tool as completed.
    send(ctx, aborted || event.isError ? "PostToolUseFailure" : "PostToolUse", aborted ? "idle" : event.isError ? "error" : "working",
      { tool: (tools[event.toolName] ?? event.toolName).slice(0, 200), target: target(event.input),
        ...((tools[event.toolName] ?? event.toolName) === "Bash" && typeof event.input.command === "string" ? { command: event.input.command.slice(0, 8000) } : {}) });
  });
  pi.on("agent_end", (event) => {
    const last = [...event.messages].reverse().find((message) => message.role === "assistant");
    if (last?.role !== "assistant") return;
    reply = last.content.filter((part) => part.type === "text").map((part) => part.text).join("\n").slice(0, 8000);
  });
  // Use the final boundary, not an assistant from an earlier retry or an error-shaped abort.
  pi.on("agent_before_settle", (event) => {
    outcome = runSignal?.aborted || event.outcome === "aborted" ? "Interrupt"
      : event.outcome === "error" ? "StopFailure" : "Stop";
  });
  // agent_end can still be followed by recovery/compaction; only settled is ready for the next say.
  pi.on("agent_settled", (_event, ctx) => {
    // pi skips agent_before_settle on a direct abort; the captured operation signal is final.
    if (runSignal?.aborted) outcome = "Interrupt";
    active = false; runSignal = undefined;
    send(ctx, outcome, outcome === "StopFailure" ? "error" : outcome === "Interrupt" ? "idle" : "success",
      outcome === "Stop" ? { text: reply } : {});
  });
  pi.on("session_before_compact", (_event, ctx) => { send(ctx, "PreCompact", "working"); });
  pi.on("session_compact", (event, ctx) => { if (!event.willRetry) send(ctx, "PostCompact", "idle"); });
  pi.on("session_compact_failed", (event, ctx) => {
    if (!event.willRetry) send(ctx, "PostCompact", "idle", { detail: event.aborted ? "Compaction cancelled" : "Compaction failed" });
  });
  pi.on("ui_prompt_start", (_event, ctx) => { send(ctx, "Notification", "waiting_input"); });
  pi.on("ui_prompt_end", (_event, ctx) => { send(ctx, "Notification", active ? "thinking" : "idle"); });
  // Reload keeps the hero; ID-changing SessionStart retires the previous hero at the server.
  // Sending terminal-bearing SessionEnd here would also close a continuing PTY.
  pi.on("session_shutdown", async (event, ctx) => {
    // Only shutdown waits, at most the same 500ms network budget, before Pi exits.
    if (event.reason === "quit") await send(ctx, "SessionEnd", "idle");
  });
}
