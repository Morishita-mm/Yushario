import { mobileBase64url, mobileInteger, mobileObject } from "./mobile-protocol";
import { PERMISSION_TIMEOUT_MS } from "./permissions";

export type MobilePushKind = "permission" | "report" | "error";
// Expo ttl is whole seconds. Never extend a permission's remaining lifetime.
export function mobilePermissionPushTtl(expiresAt: number, now: number): number {
  if (!mobileInteger(expiresAt) || !mobileInteger(now)) return 0;
  return Math.max(0, Math.floor(Math.min(PERMISSION_TIMEOUT_MS, expiresAt - now) / 1000));
}
export const MOBILE_PUSH_ERRORS = ["DeviceNotRegistered", "MessageTooBig", "MessageRateExceeded", "MismatchSenderId", "InvalidCredentials",
  "UNAUTHORIZED", "PUSH_TOO_MANY_EXPERIENCE_IDS", "PUSH_TOO_MANY_NOTIFICATIONS", "PUSH_TOO_MANY_RECEIPTS", "VALIDATION_ERROR",
  "UnknownExpoError", "InvalidResponse", "SendHttpError", "SendNetworkError", "ReceiptHttpError", "ReceiptNetworkError",
  "ReceiptNotFound", "NoPushToken", "QueueFull", "GatewayStopped", "Interrupted"] as const;
export type MobilePushError = typeof MOBILE_PUSH_ERRORS[number];
export type MobilePushLogEntry = {
  time: number; deviceId: string; kind: MobilePushKind;
  ticketStatus: "pending" | "ok" | "error" | "skipped";
  receiptStatus: "none" | "pending" | "ok" | "error" | "unknown";
  errorCode: MobilePushError | null;
};
type Ticket = { status: "ok"; id: string } | { status: "error"; errorCode: MobilePushError };
type Receipt = { status: "ok" | "pending" } | { status: "error" | "unknown"; errorCode: MobilePushError };
const object = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : undefined;

function safeError(value: unknown): MobilePushError {
  return (MOBILE_PUSH_ERRORS as readonly unknown[]).includes(value) ? value as MobilePushError : "UnknownExpoError";
}
function apiError(value: Record<string, unknown> | undefined): MobilePushError | undefined {
  return Array.isArray(value?.errors) && value.errors.length ? safeError(object(value.errors[0])?.code) : undefined;
}

export function parseMobilePushTicket(input: unknown): Ticket {
  const response = object(input), data = response?.data;
  // We send exactly one token. Expo may still wrap its single ticket in an array.
  const ticket = object(Array.isArray(data) ? data.length === 1 ? data[0] : undefined : data);
  if (ticket?.status === "ok" && typeof ticket.id === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(ticket.id)) return { status: "ok", id: ticket.id };
  if (ticket?.status === "error") return { status: "error", errorCode: safeError(object(ticket.details)?.error) };
  return { status: "error", errorCode: apiError(response) ?? "InvalidResponse" };
}

export function parseMobilePushReceipt(input: unknown, id: string): Receipt {
  const response = object(input), data = object(response?.data), errorCode = apiError(response);
  if (errorCode) return { status: "unknown", errorCode };
  if (!data) return { status: "unknown", errorCode: "InvalidResponse" };
  if (!Object.hasOwn(data, id)) return { status: "pending" };
  const receipt = object(data[id]);
  if (receipt?.status === "ok") return { status: "ok" };
  if (receipt?.status === "error") return { status: "error", errorCode: safeError(object(receipt.details)?.error) };
  return { status: "unknown", errorCode: "InvalidResponse" };
}

export function parseMobilePushLogEntry(value: unknown): MobilePushLogEntry | undefined {
  if (!mobileObject(value, ["time", "deviceId", "kind", "ticketStatus", "receiptStatus", "errorCode"])
    || !mobileInteger(value.time) || !mobileBase64url(value.deviceId, 32)
    || !["permission", "report", "error"].includes(value.kind as string)
    || !["pending", "ok", "error", "skipped"].includes(value.ticketStatus as string)
    || !["none", "pending", "ok", "error", "unknown"].includes(value.receiptStatus as string)
    || value.errorCode !== null && !(MOBILE_PUSH_ERRORS as readonly unknown[]).includes(value.errorCode)) return;
  return value as MobilePushLogEntry;
}

// Select only the six permitted fields; never copy token, ticket id or provider message.
export function mobilePushLogEntry(input: MobilePushLogEntry): MobilePushLogEntry {
  const { time, deviceId, kind, ticketStatus, receiptStatus, errorCode } = input;
  const entry = { time, deviceId, kind, ticketStatus, receiptStatus, errorCode };
  if (!parseMobilePushLogEntry(entry)) throw new RangeError("Invalid mobile push log entry");
  return entry;
}

export function lastMobilePushResults(entries: readonly MobilePushLogEntry[]): MobilePushLogEntry[] {
  const latest = new Map<string, MobilePushLogEntry>();
  for (const entry of entries) {
    if (entry.time >= (latest.get(entry.deviceId)?.time ?? -1)) latest.set(entry.deviceId, mobilePushLogEntry(entry));
  }
  return [...latest.values()];
}

export function mobilePushOutcome(entry: MobilePushLogEntry): "delivered" | "failed" | "unconfirmed" | "no-token" {
  if (entry.ticketStatus === "skipped" && entry.errorCode === "NoPushToken") return "no-token";
  if (entry.receiptStatus === "ok") return "delivered";
  if (entry.ticketStatus === "error" || entry.receiptStatus === "error") return "failed";
  return "unconfirmed";
}
