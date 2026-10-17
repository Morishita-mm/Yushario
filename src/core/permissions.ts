import type { AgentEvent } from "./events";

export const PERMISSION_TIMEOUT_MS = 120_000;
export type PermissionDecision = "allow" | "deny" | "terminal";
type Summary = { tool: string; summary: string; content: string; omitted: number; agent?: string; name?: string; helper?: string };
export type Permission = { type: "permission"; id: string; expiresAt: number; terminal: string } & Summary;

function shortText(value: unknown): string | undefined {
  return typeof value === "string" && value && value.length <= 200 ? value : undefined;
}

export function permissionSummary(input: unknown, language: "ja" | "en" = "ja"): Summary | undefined {
  if (!input || typeof input !== "object") return;
  const hook = input as Record<string, unknown>;
  if (hook.hook_event_name !== "PermissionRequest" || typeof hook.tool_name !== "string"
    || !hook.tool_name || hook.tool_name.length > 200) return;
  const fields = hook.tool_input && typeof hook.tool_input === "object"
    ? hook.tool_input as Record<string, unknown> : {};
  const detail = hook.tool_name === "Bash" ? fields.command : fields.file_path ?? fields.path;
  const agent = shortText(hook.session_id);
  const name = typeof hook.cwd === "string" ? shortText(hook.cwd.split(/[\\/]/).filter(Boolean).pop()) : undefined;
  // Only command/path; long display lives in the outstanding request, not events.
  const content = typeof detail === "string" ? detail : language === "en" ? "Permission needed" : "実行には 許可がいる。";
  return { tool: hook.tool_name, summary: `${hook.tool_name}: ${content.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 120)}`,
    content: content.slice(0, 2000), omitted: Math.max(0, content.length - 2000),
    ...(agent ? { agent } : {}), ...(name ? { name } : {}),
    ...(shortText(hook.agent_id) ? { helper: shortText(hook.agent_id) } : {}) };
}

export function permissionOutput(decision: PermissionDecision, language: "ja" | "en" = "ja"): object {
  if (decision === "terminal") return {};
  return { hookSpecificOutput: { hookEventName: "PermissionRequest", decision: decision === "allow"
    ? { behavior: "allow" } : { behavior: "deny", message: language === "en" ? "Denied on the hero screen" : "Yushario の画面で拒否されました。" } } };
}

export function permissionCanDecide(permission: Permission, decision: unknown, at: number): decision is PermissionDecision {
  return at < permission.expiresAt && (decision === "deny" || decision === "terminal" || decision === "allow" && !(permission.omitted > 0));
}

export function permissionProgress(permission: Permission, event: AgentEvent): boolean {
  if (event.source !== "claude-code" || event.terminal !== permission.terminal) return false;
  const stopped = !event.subagent && ["Stop", "StopFailure", "SessionEnd"].includes(event.hook ?? "");
  const sameTool = event.subagent?.id === permission.helper && event.tool === permission.tool
    && (event.state === "error" || (event.state === "working" && event.detail === "Tool completed"));
  return stopped || sameTool;
}
