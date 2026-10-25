import { mobileBase64url, mobileInteger, mobileObject, mobileText } from "./mobile-protocol";

export const MOBILE_PAIRING_TTL_MS = 300_000;
export const MOBILE_MAX_DEVICES = 5;
export type MobilePairingOffer = {
  v: 1; addresses: string[]; gatewayEncryptionKey: string; gatewaySigningKey: string;
  pairingCode: string; expiresAt: number;
};

function isAddress(value: unknown): value is string {
  if (!mobileText(value, 300)) return false;
  const match = /^https?:\/\/(?:\[[0-9a-fA-F:.]+\]|[A-Za-z0-9.-]+):([1-9][0-9]{0,4})$/.exec(value);
  return !!match && Number(match[1]) <= 65535;
}

// Input is the JSON decoded from the QR's base64url segment; decoding is I/O-layer work.
export function parseMobilePairingOffer(input: unknown, now: number): MobilePairingOffer | undefined {
  if (!mobileObject(input, ["v", "addresses", "gatewayEncryptionKey", "gatewaySigningKey", "pairingCode", "expiresAt"])
    || input.v !== 1 || !Array.isArray(input.addresses) || input.addresses.length < 1 || input.addresses.length > 8
    || !input.addresses.every(isAddress) || new Set(input.addresses).size !== input.addresses.length
    || !mobileBase64url(input.gatewayEncryptionKey, 32) || !mobileBase64url(input.gatewaySigningKey, 32)
    || !mobileBase64url(input.pairingCode, 16) || !mobileInteger(input.expiresAt) || !mobileInteger(now)
    || input.expiresAt <= now || input.expiresAt - now > MOBILE_PAIRING_TTL_MS + 60_000) return;
  return input as MobilePairingOffer;
}

export type MobilePairingState = {
  createdAt: number; expiresAt: number; failures: number;
  status: "available" | "pending" | "consumed" | "expired" | "locked";
  deviceId: string | null;
};
export type MobilePairingEvent = { type: "fail" | "confirm" | "reject" } | { type: "reserve"; deviceId: string };

export function mobilePairingState(now: number): MobilePairingState {
  if (!mobileInteger(now) || !Number.isSafeInteger(now + MOBILE_PAIRING_TTL_MS)) throw new RangeError("Invalid pairing time");
  return { createdAt: now, expiresAt: now + MOBILE_PAIRING_TTL_MS, failures: 0, status: "available", deviceId: null };
}

export function mobilePairingTransition(
  state: MobilePairingState, event: MobilePairingEvent, now: number, deviceCount: number,
): { state: MobilePairingState; register: boolean } {
  if (!mobileInteger(now) || now < state.createdAt || !mobileInteger(deviceCount)) return { state, register: false };
  if (state.status !== "available" && state.status !== "pending") return { state, register: false };
  if (now >= state.expiresAt) return { state: { ...state, status: "expired" }, register: false };
  if (event.type === "fail" && state.status === "available") {
    const failures = state.failures + 1;
    return { state: { ...state, failures, status: failures >= 3 ? "locked" : "available" }, register: false };
  }
  if (event.type === "reserve" && state.status === "available" && deviceCount < MOBILE_MAX_DEVICES
    && mobileBase64url(event.deviceId, 32)) {
    return { state: { ...state, status: "pending", deviceId: event.deviceId }, register: false };
  }
  if ((event.type === "confirm" || event.type === "reject") && state.status === "pending") {
    return { state: { ...state, status: "consumed" }, register: event.type === "confirm" && deviceCount < MOBILE_MAX_DEVICES };
  }
  return { state, register: false };
}

export function mobileSasDigits(hash: Uint8Array): string {
  if (hash.length !== 32) throw new RangeError("SAS requires SHA-256");
  const number = (hash[0] * 0x1000000 + hash[1] * 0x10000 + hash[2] * 0x100 + hash[3]) % 1_000_000;
  return String(number).padStart(6, "0");
}

export function mobilePushPayload(kind: "permission" | "report" | "error"): {
  priority: "high"; channelId: "alerts"; title: "Yushario"; body: "確認が必要です" | "報告が届きました" | "勇者が止まりました"; data: { kind: "permission" | "report" | "error" };
} {
  if (!["permission", "report", "error"].includes(kind)) throw new RangeError("Invalid push kind");
  const body = { permission: "確認が必要です", report: "報告が届きました", error: "勇者が止まりました" } as const;
  return { priority: "high", channelId: "alerts", title: "Yushario", body: body[kind], data: { kind } };
}
