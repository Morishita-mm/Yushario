// Wire validation only. Cryptography and durable sequence storage belong to server.
export const MOBILE_VERSION = 1;
export const MOBILE_OPERATIONS = ["pair", "status", "permissions", "decide", "reports", "push-token", "unpair", "towns", "quests", "quest-create"] as const;
export type MobileOperation = typeof MOBILE_OPERATIONS[number];
export type MobileRequestBody =
  | { operation: "pair"; body: { pairingCode: string; name: string; pushToken: string | null } }
  | { operation: "status" | "permissions" | "reports" | "unpair"; body: Record<string, never> }
  | { operation: "towns" | "quests"; body: { cursor: string | null } }
  | { operation: "reports"; body: { questId: string; cursor: string | null } }
  | { operation: "quest-create"; body: { requestId: string; townId: string; title: string; purpose: string } }
  | { operation: "decide"; body: { permissionId: string; contentHash: string; decision: "allow" | "deny" } }
  | { operation: "push-token"; body: { token: string | null } };
export type MobileHeader = { v: 1; deviceId: string; seq: number; timestamp: number };
export type MobileRequest = MobileHeader & MobileRequestBody;
export type MobileSignedRequest = MobileRequest & { signature: string };
export type MobilePacket = {
  v: 1; deviceId: string; seq: number; ciphertext: string;
  phoneEncryptionKey: string; phoneSigningKey: string;
};

export function mobileObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

// Limits intentionally use UTF-16 code units, matching existing permissions.ts.
export function mobileText(value: unknown, max: number, empty = false): value is string {
  if (typeof value !== "string" || value.length > max || !empty && !value.length) return false;
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

export function mobileInteger(value: unknown, min = 0): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min;
}

export function mobileBase64url(value: unknown, bytes?: number): value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) return false;
  if (bytes !== undefined && value.length !== Math.ceil(bytes * 8 / 6)) return false;
  const last = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".indexOf(value.at(-1)!);
  return value.length % 4 === 2 ? last % 16 === 0 : value.length % 4 === 3 ? last % 4 === 0 : true;
}

export function mobilePushToken(value: unknown): value is string | null {
  return value === null || typeof value === "string" && /^[\x21-\x7e]{1,512}$/.test(value);
}

export function isMobileOperation(value: unknown): value is MobileOperation {
  return typeof value === "string" && (MOBILE_OPERATIONS as readonly string[]).includes(value);
}

export function mobileCursor(value: unknown): value is string | null {
  return value === null || mobileText(value, 200);
}

// Time-bound random ID: expired IDs remain invalid even after dedup records are pruned.
export function mobileQuestRequestTime(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,15})\.[A-Za-z0-9_-]{22}$/.test(value)) return;
  const [time, random] = value.split(".");
  if (mobileInteger(Number(time)) && mobileBase64url(random, 16)) return Number(time);
}

export function parseMobileRequestBody(operation: unknown, body: unknown): MobileRequestBody | undefined {
  if (!isMobileOperation(operation)) return;
  if (operation === "pair") {
    if (mobileObject(body, ["pairingCode", "name", "pushToken"]) && mobileBase64url(body.pairingCode, 16)
      && mobileText(body.name, 80) && !/[\u0000-\u001f\u007f]/.test(body.name) && mobilePushToken(body.pushToken)) {
      return { operation, body: { pairingCode: body.pairingCode, name: body.name, pushToken: body.pushToken } };
    }
  } else if (operation === "decide") {
    if (mobileObject(body, ["permissionId", "contentHash", "decision"]) && mobileText(body.permissionId, 200)
      && mobileBase64url(body.contentHash, 32) && (body.decision === "allow" || body.decision === "deny")) {
      return { operation, body: { permissionId: body.permissionId, contentHash: body.contentHash, decision: body.decision } };
    }
  } else if (operation === "push-token") {
    if (mobileObject(body, ["token"]) && mobilePushToken(body.token)) return { operation, body: { token: body.token } };
  } else if (operation === "towns" || operation === "quests") {
    if (mobileObject(body, ["cursor"]) && mobileCursor(body.cursor)) return { operation, body: { cursor: body.cursor } };
  } else if (operation === "quest-create") {
    if (mobileObject(body, ["requestId", "townId", "title", "purpose"]) && mobileQuestRequestTime(body.requestId) !== undefined
      && mobileText(body.townId, 200) && mobileText(body.title, 200) && body.title.trim().length > 0 && mobileText(body.purpose, 2000, true)) {
      return { operation, body: { requestId: body.requestId as string, townId: body.townId, title: body.title, purpose: body.purpose } };
    }
  } else if (operation === "reports") {
    if (mobileObject(body, [])) return { operation, body: {} };
    if (mobileObject(body, ["questId", "cursor"]) && mobileText(body.questId, 200) && mobileCursor(body.cursor)) {
      return { operation, body: { questId: body.questId, cursor: body.cursor } };
    }
  } else if (mobileObject(body, [])) return { operation, body: {} };
}

export function parseMobileRequest(input: unknown): MobileSignedRequest | undefined {
  if (!mobileObject(input, ["v", "deviceId", "seq", "timestamp", "operation", "body", "signature"])
    || input.v !== 1 || !mobileBase64url(input.deviceId, 32) || !mobileInteger(input.seq, 1)
    || !mobileInteger(input.timestamp) || !mobileBase64url(input.signature, 64)) return;
  const request = parseMobileRequestBody(input.operation, input.body);
  if (request?.operation === "pair" && input.seq !== 1) return;
  if (request) return { v: 1, deviceId: input.deviceId, seq: input.seq, timestamp: input.timestamp, ...request, signature: input.signature };
}

export function parseMobilePacket(input: unknown): MobilePacket | undefined {
  if (!mobileObject(input, ["v", "deviceId", "seq", "ciphertext", "phoneEncryptionKey", "phoneSigningKey"])
    || input.v !== 1 || !mobileBase64url(input.deviceId, 32) || !mobileInteger(input.seq, 1)
    || !mobileBase64url(input.phoneEncryptionKey, 32) || !mobileBase64url(input.phoneSigningKey, 32)
    || !mobileBase64url(input.ciphertext) || input.ciphertext.length < 22 || input.ciphertext.length > 699_051) return;
  return input as MobilePacket;
}

export function mobileReplayAllowed(seq: number, timestamp: number, lastAccepted: number, now: number): boolean {
  return mobileInteger(seq, 1) && mobileInteger(timestamp) && mobileInteger(lastAccepted)
    && mobileInteger(now) && seq > lastAccepted && Math.abs(timestamp - now) <= 60_000;
}

export function mobileRequestBodyValues(request: MobileRequestBody): unknown[] {
  switch (request.operation) {
    case "pair": return [request.body.pairingCode, request.body.name, request.body.pushToken];
    case "decide": return [request.body.permissionId, request.body.contentHash, request.body.decision];
    case "push-token": return [request.body.token];
    case "towns": case "quests": return [request.body.cursor];
    case "quest-create": return [request.body.requestId, request.body.townId, request.body.title, request.body.purpose];
    case "reports": return "questId" in request.body ? [request.body.questId, request.body.cursor] : [];
    default: return [];
  }
}
