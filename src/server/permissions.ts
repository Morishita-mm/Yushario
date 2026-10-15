import { tr } from "./language";
import type { AgentEvent } from "../core/events";

export const PERMISSION_TIMEOUT_MS = 120_000;
export type PermissionDecision = "allow" | "deny" | "terminal";
type Summary = { tool: string; summary: string; content: string; omitted: number; agent?: string; name?: string; helper?: string };
export type Permission = { type: "permission"; id: string; expiresAt: number; terminal: string } & Summary;

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
  // Only the command/path, never edited contents, prompts or tool output. The longer
  // display lives only in the outstanding request; events keep the short summary.
  const content = typeof detail === "string" ? detail : tr("実行の許可が必要です", "Permission needed");
  return { tool: hook.tool_name, summary: `${hook.tool_name}: ${content.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 120)}`,
    content: content.slice(0, 2000), omitted: Math.max(0, content.length - 2000),
    ...(agent ? { agent } : {}), ...(name ? { name } : {}),
    ...(shortText(hook.agent_id) ? { helper: shortText(hook.agent_id) } : {}) };
}

export function permissionOutput(decision: PermissionDecision): object {
  if (decision === "terminal") return {};
  return { hookSpecificOutput: { hookEventName: "PermissionRequest", decision: decision === "allow"
    ? { behavior: "allow" } : { behavior: "deny", message: tr("キャラクター画面で拒否されました", "Denied on the hero screen") } } };
}

// Independent, bounded calls, not a queue. No arrival displaces another request.
export class PermissionWaiter {
  private readonly waiting = new Map<string, { permission: Permission; finish: (decision: PermissionDecision) => void }>();
  get pending(): Permission[] { return [...this.waiting.values()].map((item) => item.permission); }

  wait(permission: Permission, connected: boolean): Promise<PermissionDecision> {
    if (!connected || this.waiting.size >= 16 || this.waiting.has(permission.id)) return Promise.resolve("terminal");
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.decide(permission.id, "terminal"), Math.max(0, permission.expiresAt - Date.now()));
      this.waiting.set(permission.id, { permission, finish: (decision) => {
        clearTimeout(timer);
        this.waiting.delete(permission.id);
        resolve(decision);
      } });
    });
  }

  decide(id: unknown, decision: unknown): boolean {
    const item = typeof id === "string" ? this.waiting.get(id) : undefined;
    if (!item || (decision !== "allow" && decision !== "deny" && decision !== "terminal")) return false;
    if (Date.now() >= item.permission.expiresAt) { item.finish("terminal"); return false; }
    // Enforce this here too: a stale or modified screen cannot approve hidden input.
    if (decision === "allow" && item.permission.omitted > 0) return false;
    item.finish(decision);
    return true;
  }

  observe(event: AgentEvent): void {
    for (const { permission, finish } of this.waiting.values()) {
      if (event.source !== "claude-code" || event.terminal !== permission.terminal) continue;
      const stopped = !event.subagent && ["Stop", "StopFailure", "SessionEnd"].includes(event.hook ?? "");
      const sameTool = event.subagent?.id === permission.helper && event.tool === permission.tool
        && (event.state === "error" || (event.state === "working" && event.detail === "Tool completed"));
      if (stopped || sameTool) finish("terminal");
    }
  }

  cancel(): void { for (const item of this.waiting.values()) item.finish("terminal"); }
}
