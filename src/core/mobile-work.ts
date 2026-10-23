// Quest work operations (options, draft, prepare, form, embark, depart): types, request checks and signed values.
// Only opaque IDs, fixed enums and bounded text cross the wire; never paths, commands or session names.
// Imports from mobile-protocol are used only at call time, so the module cycle is harmless.
import { mobileObject, mobileQuestRequestTime, mobileText } from "./mobile-protocol";

export const MOBILE_WORK_OPERATIONS = ["quest-options", "quest-draft", "quest-prepare", "quest-form", "quest-embark", "quest-depart"] as const;
export type MobileWorkOperation = typeof MOBILE_WORK_OPERATIONS[number];
export const MOBILE_TACTICS = ["obey", "review", "research", "delegate"] as const;
export type MobileTactic = typeof MOBILE_TACTICS[number];
export const MOBILE_WORK_ROLES = ["implement", "research", "review", "command"] as const;
export type MobileWorkRole = typeof MOBILE_WORK_ROLES[number];

export type MobileChoice = { id: string; name: string };
export type MobileWorkPreset = { id: string; name: string; weapons: MobileChoice[]; accessories: MobileChoice[] };
// preset/weapon/accessory are display labels, never raw paths.
// permissionGate=false means tool use is not checked before it runs (e.g. a Mac-started pi); warn before sending.
export type MobileWorkHero = {
  id: string; name: string; preset: string; weapon: string | null; accessory: string | null;
  busy: boolean; canTalk: boolean; active: boolean; questId: string | null; permissionGate: boolean;
};
export type MobileLaunch = { baseId: string; presetId: string; weaponId: string | null; accessoryId: string | null };
export type MobileFormMember = { heroId: string; role: MobileWorkRole; writer: boolean; ask: string };
export type MobileWorkFit = { tactic: MobileTactic; ok: boolean; gaps: string[]; inside: string[]; outside: string[] };
export type MobileWorkStep = {
  heroId: string; kind: "request" | "ask" | "research";
  state: "pending" | "sent" | "held" | "deferred" | "unknown";
};
export type MobileWorkDraft = {
  questId: string; text: string; tactic: MobileTactic; members: MobileFormMember[]; fits: MobileWorkFit[];
  editable: boolean; draftLost: boolean;
  departure: { state: "not-started" | "partial" | "complete" | "uncertain"; steps: MobileWorkStep[] };
};
export type MobilePrepareMode = "only" | "send" | "party";

export type MobileWorkRequestBody =
  | { operation: "quest-options"; body: { townId: string } }
  | { operation: "quest-draft"; body: { questId: string } }
  | { operation: "quest-prepare"; body: { requestId: string; townId: string; text: string; mode: MobilePrepareMode; heroId: string | null; launch: MobileLaunch | null } }
  | { operation: "quest-form"; body: { requestId: string; questId: string; text: string; members: MobileFormMember[]; tactic: MobileTactic } }
  | { operation: "quest-embark"; body: { requestId: string; questId: string; launch: MobileLaunch; role: MobileWorkRole; writer: boolean } }
  | { operation: "quest-depart"; body: { requestId: string; questId: string } };

export const MOBILE_WORK_MEMBERS = 16;
export const MOBILE_WORK_TEXT = 8000;

export function mobileId(value: unknown): value is string {
  return mobileText(value, 200);
}
export function mobileNullableId(value: unknown): value is string | null {
  return value === null || mobileId(value);
}
export function mobileOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}
// Bounded array of valid rows; `key` rejects duplicate rows by that member.
export function mobileRows<T>(value: unknown, max: number, valid: (row: unknown) => row is T, key?: (row: T) => string): value is T[] {
  if (!Array.isArray(value) || value.length > max || !value.every(valid)) return false;
  return !key || new Set(value.map(key)).size === value.length;
}
// Signed and sent untrimmed; only whitespace-only text is refused.
function workText(value: unknown): value is string {
  return mobileText(value, MOBILE_WORK_TEXT) && value.trim().length > 0;
}
function requestId(value: unknown): value is string {
  return mobileQuestRequestTime(value) !== undefined;
}

export function isMobileLaunch(value: unknown): value is MobileLaunch {
  return mobileObject(value, ["baseId", "presetId", "weaponId", "accessoryId"]) && mobileId(value.baseId)
    && mobileId(value.presetId) && mobileNullableId(value.weaponId) && mobileNullableId(value.accessoryId);
}
export function isMobileFormMember(value: unknown): value is MobileFormMember {
  return mobileObject(value, ["heroId", "role", "writer", "ask"]) && mobileId(value.heroId)
    && mobileOneOf(value.role, MOBILE_WORK_ROLES) && typeof value.writer === "boolean" && mobileText(value.ask, MOBILE_WORK_TEXT, true);
}
export function mobileFormMembers(value: unknown): value is MobileFormMember[] {
  return mobileRows(value, MOBILE_WORK_MEMBERS, isMobileFormMember, member => member.heroId);
}

export function parseMobileWorkRequest(operation: unknown, body: unknown): MobileWorkRequestBody | undefined {
  switch (operation) {
    case "quest-options":
      if (mobileObject(body, ["townId"]) && mobileId(body.townId)) return { operation, body: { townId: body.townId } };
      break;
    case "quest-draft":
      if (mobileObject(body, ["questId"]) && mobileId(body.questId)) return { operation, body: { questId: body.questId } };
      break;
    case "quest-prepare":
      // Hero and launch are exclusive; a launch only makes sense when sending. Send without either is a card.
      if (mobileObject(body, ["requestId", "townId", "text", "mode", "heroId", "launch"]) && requestId(body.requestId)
        && mobileId(body.townId) && workText(body.text)
        && mobileOneOf(body.mode, ["only", "send", "party"] as const) && mobileNullableId(body.heroId)
        && (body.launch === null || isMobileLaunch(body.launch) && body.mode === "send" && body.heroId === null)) {
        return { operation, body: { requestId: body.requestId, townId: body.townId, text: body.text, mode: body.mode,
          heroId: body.heroId, launch: body.launch } };
      }
      break;
    case "quest-form":
      if (mobileObject(body, ["requestId", "questId", "text", "members", "tactic"]) && requestId(body.requestId) && mobileId(body.questId)
        && workText(body.text) && mobileFormMembers(body.members) && mobileOneOf(body.tactic, MOBILE_TACTICS)) {
        return { operation, body: { requestId: body.requestId, questId: body.questId, text: body.text, members: body.members, tactic: body.tactic } };
      }
      break;
    case "quest-embark":
      if (mobileObject(body, ["requestId", "questId", "launch", "role", "writer"]) && requestId(body.requestId) && mobileId(body.questId)
        && isMobileLaunch(body.launch) && mobileOneOf(body.role, MOBILE_WORK_ROLES) && typeof body.writer === "boolean") {
        return { operation, body: { requestId: body.requestId, questId: body.questId, launch: body.launch, role: body.role, writer: body.writer } };
      }
      break;
    case "quest-depart":
      if (mobileObject(body, ["requestId", "questId"]) && requestId(body.requestId) && mobileId(body.questId)) {
        return { operation, body: { requestId: body.requestId, questId: body.questId } };
      }
  }
}

// Assigning a busy/queued hero or granting a commander role can activate work too.
// The server checks current state; the app conservatively authenticates every assignment/nonempty form.
export function mobileWorkMovesAgents(request: { operation: string; body: unknown }): boolean {
  const { operation, body } = request as MobileWorkRequestBody;
  if (operation === "quest-embark" || operation === "quest-depart") return true;
  if (operation === "quest-form") return body.members.length > 0;
  return operation === "quest-prepare" && (body.launch !== null || body.heroId !== null);
}

export function mobileLaunchValues(value: MobileLaunch): unknown[] {
  return [value.baseId, value.presetId, value.weaponId, value.accessoryId];
}
export function mobileFormMemberValues(value: MobileFormMember): unknown[] {
  return [value.heroId, value.role, value.writer, value.ask];
}

export function mobileWorkRequestValues(request: MobileWorkRequestBody): unknown[] {
  switch (request.operation) {
    case "quest-options": return [request.body.townId];
    case "quest-draft": return [request.body.questId];
    case "quest-prepare": {
      const body = request.body;
      return [body.requestId, body.townId, body.text, body.mode, body.heroId, body.launch === null ? null : mobileLaunchValues(body.launch)];
    }
    case "quest-form": {
      const body = request.body;
      return [body.requestId, body.questId, body.text, body.members.map(mobileFormMemberValues), body.tactic];
    }
    case "quest-embark": {
      const body = request.body;
      return [body.requestId, body.questId, mobileLaunchValues(body.launch), body.role, body.writer];
    }
    case "quest-depart": return [request.body.requestId, request.body.questId];
  }
}
