import {
  isMobileOperation, mobileBase64url, mobileInteger, mobileObject, mobileText,
  type MobileHeader,
} from "./mobile-protocol";

import { parseMobileQuestResponse, mobileQuestValues, mobileReportValues, type MobileQuestResponseBody } from "./mobile-quests";
export type { MobileReport, MobileQuest, MobileTown, MobileTownTheme } from "./mobile-quests";
import { mobileWorkResponseValues, parseMobileWorkResponse, type MobileWorkResponseBody } from "./mobile-work-display";
export type { MobileDelivery, MobileWorkResponseBody } from "./mobile-work-display";

import { mobileNullableId } from "./mobile-work";
import { isMobilePermissionChange, isMobilePermissionWork, mobileChangeTextLength, mobilePermissionChangeValues,
  mobilePermissionWorkValues, MOBILE_PERMISSION_TEXT, type MobilePermissionDetails } from "./mobile-permission";
export { mobilePermissionCanAllow } from "./mobile-permission";
export type { MobilePermissionChange, MobilePermissionEdit, MobilePermissionWork } from "./mobile-permission";

export type MobileHero = {
  id: string; name: string; town: string; townId: string | null;
  state: "idle" | "thinking" | "working" | "waiting_input" | "success" | "error"; permissionPending: boolean;
};
export type MobilePermissionContent = {
  id: string; heroId: string; heroName: string; town: string; townId: string | null; tool: string; summary: string;
  content: string; omitted: number; expiresAt: number;
} & MobilePermissionDetails;
export type MobilePermission = MobilePermissionContent & { contentHash: string };
export type MobileResponseBody = MobileQuestResponseBody | MobileWorkResponseBody
  | { operation: "pair"; body: { registered: true } }
  | { operation: "status"; body: { heroes: MobileHero[] } }
  | { operation: "permissions"; body: { permissions: MobilePermission[] } }
  | { operation: "decide"; body: { decided: true } }
  | { operation: "push-token"; body: { updated: true } }
  | { operation: "unpair"; body: { unpaired: true } };
export type MobileResponse = MobileHeader & MobileResponseBody;
export type MobileSignedResponse = MobileResponse & { signature: string };

export function mobilePermissionContentValues(value: MobilePermissionContent): unknown[] {
  return [value.id, value.heroId, value.heroName, value.town, value.tool, value.summary,
    value.content, value.omitted, value.expiresAt, value.townId,
    mobilePermissionWorkValues(value.work), mobilePermissionChangeValues(value.change)];
}

export function mobilePermissionHashInput(value: MobilePermissionContent): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(["yushario.permission.v1", ...mobilePermissionContentValues(value)]));
}

function isHero(value: unknown): value is MobileHero {
  return mobileObject(value, ["id", "name", "town", "state", "permissionPending", "townId"])
    && mobileNullableId(value.townId) && mobileText(value.id, 200) && mobileText(value.name, 200) && mobileText(value.town, 200)
    && ["idle", "thinking", "working", "waiting_input", "success", "error"].includes(value.state as string)
    && typeof value.permissionPending === "boolean";
}

export function isMobilePermission(value: unknown): value is MobilePermission {
  return mobileObject(value, ["id", "heroId", "heroName", "town", "tool", "summary", "content", "omitted", "expiresAt", "contentHash", "townId", "work", "change"])
    && mobileNullableId(value.townId) && mobileText(value.id, 200) && mobileText(value.heroId, 200) && mobileText(value.heroName, 200)
    && mobileText(value.town, 200) && mobileText(value.tool, 200) && mobileText(value.summary, 200)
    && mobileText(value.content, 2000, true) && mobileInteger(value.omitted) && mobileInteger(value.expiresAt)
    && isMobilePermissionWork(value.work) && isMobilePermissionChange(value.change, value.tool)
    && value.content.length + mobileChangeTextLength(value.change) <= MOBILE_PERMISSION_TEXT
    && mobileBase64url(value.contentHash, 32);
}

export function parseMobileResponseBody(operation: unknown, body: unknown): MobileResponseBody | undefined {
  if (!isMobileOperation(operation)) return;
  switch (operation) {
    case "pair":
      if (mobileObject(body, ["registered"]) && body.registered === true) return { operation, body: { registered: true } };
      break;
    case "decide":
      if (mobileObject(body, ["decided"]) && body.decided === true) return { operation, body: { decided: true } };
      break;
    case "push-token":
      if (mobileObject(body, ["updated"]) && body.updated === true) return { operation, body: { updated: true } };
      break;
    case "unpair":
      if (mobileObject(body, ["unpaired"]) && body.unpaired === true) return { operation, body: { unpaired: true } };
      break;
    case "status":
      if (mobileObject(body, ["heroes"]) && Array.isArray(body.heroes) && body.heroes.length <= 100 && body.heroes.every(isHero)) {
        return { operation, body: { heroes: body.heroes } };
      }
      break;
    case "permissions":
      if (mobileObject(body, ["permissions"]) && Array.isArray(body.permissions)
        && body.permissions.length <= 16 && body.permissions.every(isMobilePermission)) {
        return { operation, body: { permissions: body.permissions } };
      }
      break;
    default: return parseMobileQuestResponse(operation, body) ?? parseMobileWorkResponse(operation, body);
  }
}

export function parseMobileResponse(input: unknown): MobileSignedResponse | undefined {
  if (!mobileObject(input, ["v", "deviceId", "seq", "timestamp", "operation", "body", "signature"])
    || input.v !== 1 || !mobileBase64url(input.deviceId, 32) || !mobileInteger(input.seq, 1)
    || !mobileInteger(input.timestamp) || !mobileBase64url(input.signature, 64)) return;
  const response = parseMobileResponseBody(input.operation, input.body);
  if (response?.operation === "pair" && input.seq !== 1) return;
  if (response) return { v: 1, deviceId: input.deviceId, seq: input.seq, timestamp: input.timestamp, ...response, signature: input.signature };
}

export function mobileResponseBodyValues(response: MobileResponseBody): unknown[] {
  switch (response.operation) {
    case "pair": return [response.body.registered];
    case "status": return [response.body.heroes.map(hero => [hero.id, hero.name, hero.town, hero.state, hero.permissionPending, hero.townId])];
    case "permissions": return [response.body.permissions.map(value => [...mobilePermissionContentValues(value), value.contentHash])];
    case "decide": return [response.body.decided];
    case "towns": return [response.body.towns.map(town => [town.id, town.name, town.theme]), response.body.nextCursor];
    case "quests": return [response.body.quests.map(mobileQuestValues), response.body.nextCursor];
    case "quest-create": return [mobileQuestValues(response.body.quest)];
    case "reports": return [response.body.reports.map(mobileReportValues), response.body.nextCursor];
    case "push-token": return [response.body.updated];
    case "unpair": return [response.body.unpaired];
    default: return mobileWorkResponseValues(response);
  }
}
