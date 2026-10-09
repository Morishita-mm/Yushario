import type { AgentEvent } from "../core/events";

export const PERMISSION_TIMEOUT_MS = 120_000;
export type PermissionDecision = "allow" | "deny" | "terminal";
type Summary = { tool: string; summary: string; agent?: string; name?: string; helper?: string };
export type Permission = { type: "permission"; id: string } & Summary;

function shortText(value: unknown): string | undefined {
  return typeof value === "string" && value && value.length <= 200 ? value : undefined;
}

export function permissionSummary(input: unknown): Summary | undefined {
  if (!input || typeof input !== "object") return;
  const hook = input as Record<string, unknown>;
  if (hook.hook_event_name !== "PermissionRequest" || typeof hook.tool_name !== "string"
    || !hook.tool_name || hook.tool_name.length > 200) return;
  const fields = hook.tool_input && typeof hook.tool_input === "object"
    ? hook.tool_input as Record<string, unknown> : {};
  const detail = hook.tool_name === "Bash" ? fields.command : fields.file_path ?? fields.path;
  const agent = shortText(hook.session_id);
  const name = typeof hook.cwd === "string" ? shortText(hook.cwd.split(/[\\/]/).filter(Boolean).pop()) : undefined;
  // No full input, prompt, or tool output is kept or passed to the Decider.
  return { tool: hook.tool_name, summary: `${hook.tool_name}: ${typeof detail === "string"
    ? detail.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 120) : "実行の許可が必要です"}`,
    ...(agent ? { agent } : {}), ...(name ? { name } : {}),
    ...(shortText(hook.agent_id) ? { helper: shortText(hook.agent_id) } : {}) };
}

export function permissionOutput(decision: PermissionDecision): object {
  if (decision === "terminal") return {};
  return { hookSpecificOutput: { hookEventName: "PermissionRequest", decision: decision === "allow"
    ? { behavior: "allow" } : { behavior: "deny", message: "キャラクター画面で拒否されました" } } };
}

// One outstanding call; a replacement falls back to the terminal, never silently approves.
export class PermissionWaiter {
  current: Permission | undefined;
  private finish: ((decision: PermissionDecision) => void) | undefined;

  wait(permission: Permission, connected: boolean): Promise<PermissionDecision> {
    this.cancel();
    if (!connected) return Promise.resolve("terminal");
    this.current = permission;
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.decide(permission.id, "terminal"), PERMISSION_TIMEOUT_MS);
      this.finish = (decision) => {
        clearTimeout(timer);
        this.current = undefined;
        this.finish = undefined;
        resolve(decision);
      };
    });
  }

  decide(id: unknown, decision: unknown): boolean {
    if (typeof id !== "string" || id !== this.current?.id
      || (decision !== "allow" && decision !== "deny" && decision !== "terminal")) return false;
    this.finish?.(decision as PermissionDecision);
    return true;
  }

  observe(event: AgentEvent): void {
    // Claude keeps the HTTP hook open after terminal Yes. Only completion of the pending
    // tool by the same session and subagent (not another tool's PreToolUse), or the
    // session's Stop, resolves it.
    const current = this.current;
    if (!current || event.source !== "claude-code" || event.agent !== current.agent) return;
    const stopped = event.state === "success" && !event.subagent;
    const sameTool = event.subagent?.id === current.helper && event.tool === current.tool
      && (event.state === "error" || (event.state === "working" && event.detail === "Tool completed"));
    if (stopped || sameTool) this.cancel();
  }

  cancel(): void { this.finish?.("terminal"); }
}
