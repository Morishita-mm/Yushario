import type { AgentEvent } from "./events";

// What an agent is doing, as listed in docs/OBSERVATION.md. Each maps to a place in the room.
export type Activity =
  | "think" | "read" | "search" | "edit" | "test" | "git" | "run" | "web"
  | "plan" | "delegate" | "ask" | "tool" | "rest" | "idle";

const TOOLS: Record<string, Activity> = {
  Read: "read", NotebookRead: "read",
  Grep: "search", Glob: "search", LS: "search",
  Edit: "edit", MultiEdit: "edit", Write: "edit", NotebookEdit: "edit",
  WebSearch: "web", WebFetch: "web",
  TaskCreate: "plan", TaskUpdate: "plan", TaskList: "plan", TaskGet: "plan", TodoWrite: "plan",
  Agent: "delegate", Task: "delegate",
  AskUserQuestion: "ask",
};

const TEST_COMMAND = /^(?:(?:npm|pnpm|yarn|bun) (?:test|t|run (?:test|typecheck|lint|check)\S*)|npx (?:vitest|jest|tsc|eslint)|vitest|jest|pytest|tsc|eslint|go test|cargo test|rspec|mocha|phpunit)(?: |$)/;

// `target` holds the command head for Bash (see the Claude Code adapter).
export function commandActivity(head: string | undefined): Activity {
  if (!head) return "run";
  if (/^(?:git|gh)(?: |$)/.test(head)) return "git";
  return TEST_COMMAND.test(head) ? "test" : "run";
}

export function toolActivity(tool: string, target?: string): Activity {
  if (tool === "Bash") return commandActivity(target);
  return TOOLS[tool] ?? "tool";
}

// Undefined means the event does not change what the agent is doing.
export function classifyActivity(event: AgentEvent): Activity | undefined {
  switch (event.hook) {
    case "SessionStart": case "Stop": case "StopFailure": return "idle";
    case "UserPromptSubmit": case "PostCompact": return "think";
    case "PreCompact": return "rest";
    case "Notification": case "PermissionRequest": return "ask";
    case "PreToolUse": return event.tool ? toolActivity(event.tool, event.target) : undefined;
    case "PostToolUseFailure": return event.state === "idle" ? "idle" : undefined; // idle = interrupted
    default: return undefined;
  }
}
