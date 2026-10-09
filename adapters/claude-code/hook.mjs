// Command hooks must never emit text or interfere with Claude Code.
function toolFailed(response) {
  if (!response || typeof response !== "object" || Array.isArray(response)) return false;
  return response.is_error === true || response.isError === true || response.success === false
    || (typeof response.error === "string" && response.error.length > 0)
    || (typeof response.error === "object" && response.error !== null)
    || (typeof response.exit_code === "number" && response.exit_code !== 0)
    || (typeof response.exitCode === "number" && response.exitCode !== 0);
}

function toEvent(hook) {
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
  const event = toEvent(JSON.parse(input));
  if (event) {
    await fetch(process.env.AGENT_CHARACTER_URL ?? "http://127.0.0.1:8790/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(500),
      redirect: "error",
    });
  }
} catch {
  // Missing relay, timeout, malformed input, and HTTP failures are all harmless.
} finally {
  process.exit(0);
}
