import {
  isMobileOperation, mobileBase64url, mobileInteger, mobileObject, mobileText,
  type MobileHeader,
} from "./mobile-protocol";

export type MobileHero = {
  id: string; name: string; town: string;
  state: "idle" | "thinking" | "working" | "waiting_input" | "success" | "error"; permissionPending: boolean;
};
export type MobilePermissionContent = {
  id: string; heroId: string; heroName: string; town: string; tool: string; summary: string;
  content: string; omitted: number; expiresAt: number;
};
export type MobilePermission = MobilePermissionContent & { contentHash: string };
export type MobileReport = { id: string; title: string; success: boolean | null; at: number; excerpt: string };
export type MobileResponseBody =
  | { operation: "pair"; body: { registered: true } }
  | { operation: "status"; body: { heroes: MobileHero[] } }
  | { operation: "permissions"; body: { permissions: MobilePermission[] } }
  | { operation: "decide"; body: { decided: true } }
  | { operation: "reports"; body: { reports: MobileReport[] } }
  | { operation: "push-token"; body: { updated: true } }
  | { operation: "unpair"; body: { unpaired: true } };
export type MobileResponse = MobileHeader & MobileResponseBody;
export type MobileSignedResponse = MobileResponse & { signature: string };

export function mobilePermissionContentValues(value: MobilePermissionContent): unknown[] {
  return [value.id, value.heroId, value.heroName, value.town, value.tool, value.summary,
    value.content, value.omitted, value.expiresAt];
}

export function mobilePermissionHashInput(value: MobilePermissionContent): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(["yushario.permission.v1", ...mobilePermissionContentValues(value)]));
}

function isHero(value: unknown): value is MobileHero {
  return mobileObject(value, ["id", "name", "town", "state", "permissionPending"])
    && mobileText(value.id, 200) && mobileText(value.name, 200) && mobileText(value.town, 200)
    && ["idle", "thinking", "working", "waiting_input", "success", "error"].includes(value.state as string)
    && typeof value.permissionPending === "boolean";
}

export function isMobilePermission(value: unknown): value is MobilePermission {
  return mobileObject(value, ["id", "heroId", "heroName", "town", "tool", "summary", "content", "omitted", "expiresAt", "contentHash"])
    && mobileText(value.id, 200) && mobileText(value.heroId, 200) && mobileText(value.heroName, 200)
    && mobileText(value.town, 200) && mobileText(value.tool, 200) && mobileText(value.summary, 200)
    && mobileText(value.content, 2000, true) && mobileInteger(value.omitted) && mobileInteger(value.expiresAt)
    && mobileBase64url(value.contentHash, 32);
}

function isReport(value: unknown): value is MobileReport {
  return mobileObject(value, ["id", "title", "success", "at", "excerpt"])
    && mobileText(value.id, 200) && mobileText(value.title, 200)
    && (value.success === null || typeof value.success === "boolean")
    && mobileInteger(value.at) && mobileText(value.excerpt, 500, true);
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
    case "reports":
      if (mobileObject(body, ["reports"]) && Array.isArray(body.reports) && body.reports.length <= 50 && body.reports.every(isReport)) {
        return { operation, body: { reports: body.reports } };
      }
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
    case "status": return [response.body.heroes.map(hero => [hero.id, hero.name, hero.town, hero.state, hero.permissionPending])];
    case "permissions": return [response.body.permissions.map(value => [...mobilePermissionContentValues(value), value.contentHash])];
    case "decide": return [response.body.decided];
    case "reports": return [response.body.reports.map(report => [report.id, report.title, report.success, report.at, report.excerpt])];
    case "push-token": return [response.body.updated];
    case "unpair": return [response.body.unpaired];
  }
}
