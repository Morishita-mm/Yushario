import { openSync, fstatSync, readSync, closeSync, constants } from "node:fs";
import { execFile } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

// Command hooks must stay silent on stdout/stderr and never interfere with Claude Code.
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

// Tool input leaves the adapter only as short local-display targets (docs/OBSERVATION.md):
// file basenames, the first plain words of a command, a URL's host, a subagent type.
function commandHead(command) {
  const segments = command.split(/&&|\|\||;|\||\n/).map((part) => part.trim().split(/\s+/));
  const words = segments.find((part) => part[0] && part[0] !== "cd") ?? [];
  while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0] ?? "")) words.shift(); // FOO=bar npm test
  // Stop at the first word that may carry a path, value or secret; a path command keeps its basename.
  const head = [];
  for (const [index, word] of words.slice(0, 3).entries()) {
    if (index === 0 && /^[A-Za-z0-9._/@+-]+$/.test(word)) head.push(word.split("/").pop());
    else if (/^[A-Za-z0-9._:@+-]+$/.test(word)) head.push(word);
    else break;
  }
  return head.join(" ") || undefined;
}

function toolTarget(tool, input) {
  if (!input || typeof input !== "object") return;
  const path = input.file_path ?? input.notebook_path;
  if (typeof path === "string") return path.split(/[\\/]/).pop() || undefined;
  if (tool === "Bash" && typeof input.command === "string") return commandHead(input.command);
  if (tool === "WebFetch" && typeof input.url === "string") {
    try { return new URL(input.url).hostname || undefined; } catch { return; }
  }
  if ((tool === "Agent" || tool === "Task") && typeof input.subagent_type === "string") return input.subagent_type;
}

function text(value) {
  return typeof value === "string" && value ? value.slice(0, 200) : undefined;
}

async function projectName(cwd) {
  try {
    const { stdout } = await execute("git", ["-C", cwd, "worktree", "list", "--porcelain", "-z"], {
      timeout: Math.max(1, Math.min(150, Math.ceil(budgetMs - (performance.now() - started) - 50))),
      maxBuffer: 64 * 1024,
    });
    const main = stdout.split("\0")[0];
    if (main.startsWith("worktree ")) return basename(main.slice(9));
  } catch { /* No repository or Git unavailable: use the directory name. */ }
  return basename(cwd);
}

function hookTask(hook) {
  const id = text(hook.task_id);
  if (id && hook.hook_event_name === "TaskCreated") return { id, subject: text(hook.task_subject), status: "pending" };
  if (id && hook.hook_event_name === "TaskCompleted") return { id, subject: text(hook.task_subject), status: "completed" };
  const input = hook.tool_input;
  if (hook.hook_event_name === "PreToolUse" && hook.tool_name === "TaskUpdate" && input && typeof input === "object"
    && text(input.taskId) && ["pending", "in_progress", "completed", "deleted"].includes(input.status)) {
    return { id: text(input.taskId), status: input.status };
  }
}

async function toEvent(hook) {
  const states = {
    SessionStart: "idle",
    SessionEnd: "idle",
    UserPromptSubmit: "thinking",
    PreToolUse: "working",
    PostToolUse: "working",
    PostToolUseFailure: "error",
    Notification: "waiting_input",
    SubagentStart: "working",
    SubagentStop: "working",
    TaskCreated: "working",
    TaskCompleted: "working",
    PreCompact: "working",
    PostCompact: "thinking",
    Stop: "success",
    StopFailure: "error",
  };
  const name = hook.hook_event_name;
  const state = Object.hasOwn(states, name) ? states[name] : undefined;
  if (!state) return;
  const event = { state, source: "claude-code", ts: Date.now(), hook: name };
  const agent = text(hook.session_id);
  if (agent) event.agent = agent;
  const terminal = text(process.env.AGENT_CHARACTER_SESSION);
  if (terminal) event.terminal = terminal;
  const cwd = typeof hook.cwd === "string" ? hook.cwd : process.cwd();
  event.name = text(cwd.split(/[\\/]/).filter(Boolean).pop());
  event.project = text(await projectName(cwd));
  if (text(hook.agent_id)) event.subagent = { id: text(hook.agent_id), type: text(hook.agent_type) };
  const task = hookTask(hook);
  if (task) event.task = task;
  if (["PreToolUse", "PostToolUse", "PostToolUseFailure"].includes(name)) {
    if (typeof hook.tool_name === "string") event.tool = hook.tool_name.slice(0, 200);
    const target = text(toolTarget(hook.tool_name, hook.tool_input));
    if (target) event.target = target;
    if (name === "PostToolUse" && toolFailed(hook.tool_response)) event.state = "error";
    if (name === "PostToolUseFailure" && hook.is_interrupt === true) event.state = "idle";
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
  // Only these two conversation bodies go to the local relay/display, never Jev or files.
  const body = name === "UserPromptSubmit" ? hook.prompt : name === "Stop" ? hook.last_assistant_message : undefined;
  if (typeof body === "string") event.text = body.slice(0, 8000);
  // Notification/tool output bodies remain private; tool input only as `target` above.
  event.detail = {
    idle: name === "SessionEnd" ? "Session ended" : name === "PostToolUseFailure" ? "Interrupted" : "Session started",
    thinking: "Prompt received",
    working: "Tool activity",
    waiting_input: "Input requested",
    success: "Agent stopped",
    error: "Tool failed",
  }[event.state];
  if (name === "PostToolUse" && event.state === "working") event.detail = "Tool completed";
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
