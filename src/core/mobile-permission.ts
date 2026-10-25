// A4: the extra, mobile-only review fields. All values participate in the display hash.
import { mobileInteger, mobileObject, mobileText } from "./mobile-protocol";

export const MOBILE_CHANGE_TEXT = 2000;
export const MOBILE_PERMISSION_TEXT = 3000; // command/path + all change text
export const MOBILE_CHANGE_EDITS = 16;
export type MobilePermissionWork = { questId: string; title: string } | null;
export type MobilePermissionEdit = { before: string; after: string; replaceAll: boolean };
export type MobilePermissionChange = null
  | { kind: "write"; text: string; omitted: number }
  | { kind: "edit"; edits: MobilePermissionEdit[]; omitted: number; omittedEdits: number }
  | { kind: "unavailable" };
export type MobilePermissionDetails = { work: MobilePermissionWork; change: MobilePermissionChange };

export function mobilePermissionWorkValues(work: MobilePermissionWork): unknown {
  return work === null ? null : [work.questId, work.title];
}
export function mobilePermissionChangeValues(change: MobilePermissionChange): unknown {
  if (change === null) return null;
  switch (change.kind) {
    case "write": return [change.kind, change.text, change.omitted];
    case "edit": return [change.kind, change.edits.map(edit => [edit.before, edit.after, edit.replaceAll]), change.omitted, change.omittedEdits];
    case "unavailable": return [change.kind];
  }
}
export function mobileChangeTextLength(change: MobilePermissionChange): number {
  if (change?.kind === "write") return change.text.length;
  return change?.kind === "edit" ? change.edits.reduce((size, edit) => size + edit.before.length + edit.after.length, 0) : 0;
}
function isEdit(value: unknown): value is MobilePermissionEdit {
  return mobileObject(value, ["before", "after", "replaceAll"]) && mobileText(value.before, MOBILE_CHANGE_TEXT, true)
    && mobileText(value.after, MOBILE_CHANGE_TEXT, true) && typeof value.replaceAll === "boolean";
}
export function isMobilePermissionWork(value: unknown): value is MobilePermissionWork {
  return value === null || mobileObject(value, ["questId", "title"]) && mobileText(value.questId, 200) && mobileText(value.title, 200);
}
export function isMobilePermissionChange(value: unknown, tool: string): value is MobilePermissionChange {
  if (!["Write", "Edit", "MultiEdit"].includes(tool)) return value === null;
  if (mobileObject(value, ["kind"]) && value.kind === "unavailable") return true;
  if (tool === "Write") return mobileObject(value, ["kind", "text", "omitted"]) && value.kind === "write"
    && mobileText(value.text, MOBILE_CHANGE_TEXT, true) && mobileInteger(value.omitted);
  return mobileObject(value, ["kind", "edits", "omitted", "omittedEdits"]) && value.kind === "edit"
    && Array.isArray(value.edits) && value.edits.length >= 1 && value.edits.length <= (tool === "Edit" ? 1 : MOBILE_CHANGE_EDITS)
    && value.edits.every(isEdit) && mobileInteger(value.omitted) && mobileInteger(value.omittedEdits)
    && (tool !== "Edit" || value.omittedEdits === 0)
    && mobileChangeTextLength(value as MobilePermissionChange) <= MOBILE_CHANGE_TEXT;
}
// Unknown task context is not an incomplete tool input. Missing/invalid change input is.
export function mobilePermissionCanAllow(value: { omitted: number; change: MobilePermissionChange }): boolean {
  if (value.omitted !== 0) return false;
  const change = value.change;
  return change === null || change.kind === "write" && change.omitted === 0
    || change.kind === "edit" && change.omitted === 0 && change.omittedEdits === 0;
}
