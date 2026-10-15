import { serverLanguage } from "./language";
import type { AgentEvent } from "../core/events";
import { permissionCanDecide, permissionProgress, permissionOutput as output, permissionSummary as summary,
  type Permission, type PermissionDecision } from "../core/permissions";
export { PERMISSION_TIMEOUT_MS, type Permission, type PermissionDecision } from "../core/permissions";

export function permissionSummary(input: unknown) { return summary(input, serverLanguage()); }
export function permissionOutput(decision: PermissionDecision): object { return output(decision, serverLanguage()); }

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
    const at = Date.now();
    if (at >= item.permission.expiresAt) { item.finish("terminal"); return false; }
    if (!permissionCanDecide(item.permission, decision, at)) return false;
    item.finish(decision);
    return true;
  }

  observe(event: AgentEvent): void {
    for (const { permission, finish } of this.waiting.values()) {
      if (permissionProgress(permission, event)) finish("terminal");
    }
  }

  cancel(): void { for (const item of this.waiting.values()) item.finish("terminal"); }
}
