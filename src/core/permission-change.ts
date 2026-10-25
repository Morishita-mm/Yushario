import { mobileText } from "./mobile-protocol";
import { MOBILE_CHANGE_EDITS, MOBILE_CHANGE_TEXT, MOBILE_PERMISSION_TEXT, type MobilePermissionChange, type MobilePermissionEdit } from "./mobile-permission";

// Preserve the literal input (including controls); clients apply visible() only when rendering.
// This bounded snapshot is kept with the waiter, never in events, the ledger or Mac WS cards.
export function permissionChange(input: unknown, contentLength: number): MobilePermissionChange {
  const hook = input as { tool_name?: unknown; tool_input?: unknown } | null;
  if (!hook || !["Write", "Edit", "MultiEdit"].includes(hook.tool_name as string)) return null;
  const unavailable = { kind: "unavailable" } as const;
  if (!hook.tool_input || typeof hook.tool_input !== "object" || Array.isArray(hook.tool_input)) return unavailable;
  const fields = hook.tool_input as Record<string, unknown>;
  let remaining = Math.max(0, Math.min(MOBILE_CHANGE_TEXT, MOBILE_PERMISSION_TEXT - contentLength)), omitted = 0;
  function take(text: string): string {
    let end = Math.min(text.length, remaining);
    if (end > 0 && /[\ud800-\udbff]/.test(text[end - 1])) end--;
    remaining -= end; omitted += text.length - end;
    return text.slice(0, end);
  }
  const text = (value: unknown): value is string => mobileText(value, Number.MAX_SAFE_INTEGER, true);
  if (hook.tool_name === "Write") {
    if (!text(fields.content)) return unavailable;
    return { kind: "write", text: take(fields.content), omitted };
  }
  const items = hook.tool_name === "Edit" ? [fields] : fields.edits;
  if (!Array.isArray(items) || items.length === 0) return unavailable;
  const edits: MobilePermissionEdit[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item) || !text(item.old_string) || !text(item.new_string)
      || item.replace_all !== undefined && typeof item.replace_all !== "boolean") return unavailable;
    if (edits.length < MOBILE_CHANGE_EDITS) {
      edits.push({ before: take(item.old_string), after: take(item.new_string), replaceAll: item.replace_all ?? false });
    } else omitted += item.old_string.length + item.new_string.length;
  }
  return { kind: "edit", edits, omitted, omittedEdits: Math.max(0, items.length - MOBILE_CHANGE_EDITS) };
}
