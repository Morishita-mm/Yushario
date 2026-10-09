import { openSync, fstatSync, readSync, closeSync, constants } from "node:fs";

// Command hooks must never emit text or interfere with Claude Code.
const started = performance.now();
const budgetMs = 500;
const deadline = setTimeout(() => process.exit(0), budgetMs);

function contextUsage(hook) {
  try {
    // 2.1.295 only supplies context_tokens on SessionStart resume/fork; no window size.
    const configured = Number(process.env.AGENT_CHARACTER_CONTEXT_WINDOW ?? 200000);
    const window = Number.isFinite(configured) && configured > 0 ? configured : 200000;
    if (hook.hook_event_name === "SessionStart" && Number.isFinite(hook.context_tokens)
      && hook.context_tokens >= 0) return Math.min(1, hook.context_tokens / window);
    if (typeof hook.transcript_path !== "string" || !hook.transcript_path) return;
    // O_NONBLOCK + regular-file check prevents a malformed path from waiting on a FIFO.
    const fd = openSync(hook.transcript_path, constants.O_RDONLY | constants.O_NONBLOCK);
    let tail;
    let offset;
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile()) return;
      const length = Math.min(stat.size, 256 * 1024);
      offset = stat.size - length;
      const bytes = Buffer.alloc(length);
      const read = readSync(fd, bytes, 0, length, offset);
      tail = bytes.toString("utf8", 0, read);
    } finally {
      closeSync(fd);
    }
    const lines = tail.split("\n");
    if (offset > 0) lines.shift(); // First line may be truncated, including a UTF-8 character.
    for (let i = lines.length - 1; i >= 0; i--) {
      if (performance.now() - started >= budgetMs - 50) return;
      let entry;
      try { entry = JSON.parse(lines[i]); } catch { continue; }
      if (entry.type !== "assistant" || entry.message?.role !== "assistant") continue;
      const usage = entry.message.usage;
      if (!usage || !Number.isFinite(usage.input_tokens) || usage.input_tokens < 0) return;
      const tokens = [usage.input_tokens, usage.cache_read_input_tokens ?? 0,
        usage.cache_creation_input_tokens ?? 0];
      if (tokens.some((n) => !Number.isFinite(n) || n < 0)) return;
      const total = tokens.reduce((sum, n) => sum + n, 0);
      if (Number.isFinite(total)) return Math.min(1, total / window);
      return;
    }
  } catch {
    // Missing, truncated or unreadable transcript: usage stays unknown, never guessed.
  }
}
function toolFailed(response) {
  if (!response || typeof response !== "object" || Array.isArray(response)) return false;
  return response.is_error === true || response.isError === true || response.success === false
    || (typeof response.error === "string" && response.error.length > 0)
    || (typeof response.error === "object" && response.error !== null)
    || (typeof response.exit_code === "number" && response.exit_code !== 0)
    || (typeof response.exitCode === "number" && response.exitCode !== 0);
}

async function toEvent(hook) {
  const states = {
    SessionStart: "idle",
    UserPromptSubmit: "thinking",
    PreToolUse: "working",
    PostToolUse: "working",
    PostToolUseFailure: "error",
    Notification: "waiting_input",
    Stop: "success",
  };
  const state = Object.hasOwn(states, hook.hook_event_name) ? states[hook.hook_event_name] : undefined;
  if (!state) return;
  const event = { state, source: "claude-code", ts: Date.now() };
  if (["PreToolUse", "PostToolUse", "PostToolUseFailure"].includes(hook.hook_event_name)) {
    if (typeof hook.tool_name === "string") event.tool = hook.tool_name.slice(0, 200);
    if (hook.hook_event_name === "PostToolUse" && toolFailed(hook.tool_response)) {
      event.state = "error";
    }
  }
  // Stop can arrive just before Claude flushes the final assistant to disk.
  // Briefly allow that flush within the same 500ms budget (no network retries).
  let context = contextUsage(hook);
  for (let attempt = 0; hook.hook_event_name === "Stop" && context === undefined && attempt < 4; attempt++) {
    if (performance.now() - started >= 300) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
    context = contextUsage(hook);
  }
  if (context !== undefined) event.context = context;
  // Never include prompt, notification, tool input, or tool output text.
  event.detail = {
    idle: "Session started",
    thinking: "Prompt received",
    working: "Tool activity",
    waiting_input: "Input requested",
    success: "Agent stopped",
    error: "Tool failed",
  }[event.state];
  if (hook.hook_event_name === "PostToolUse" && event.state === "working") event.detail = "Tool completed";
  return event;
}

try {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += chunk;
  const event = await toEvent(JSON.parse(input));
  if (event) {
    await fetch(process.env.AGENT_CHARACTER_URL ?? "http://127.0.0.1:8790/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(Math.max(1, Math.ceil(budgetMs - (performance.now() - started)))),
      redirect: "error",
    });
  }
} catch {
  // Missing relay, timeout, malformed input, and HTTP failures are all harmless.
} finally {
  clearTimeout(deadline);
  process.exit(0);
}
