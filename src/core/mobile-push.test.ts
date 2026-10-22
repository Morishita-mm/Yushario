import { describe, expect, it } from "vitest";
import { lastMobilePushResults, mobilePushLogEntry, mobilePushOutcome, parseMobilePushLogEntry,
  parseMobilePushReceipt, parseMobilePushTicket, type MobilePushLogEntry } from "./mobile-push";

const deviceId = "A".repeat(43);
const base: MobilePushLogEntry = { time: 1700000000000, deviceId, kind: "permission", ticketStatus: "ok", receiptStatus: "pending", errorCode: null };

describe("Expo ticket and receipt parsing", () => {
  it("accepts object and single-array tickets for one recipient", () => {
    for (const data of [{ status: "ok", id: "ticket-1" }, [{ status: "ok", id: "ticket-1" }]]) {
      expect(parseMobilePushTicket({ data })).toEqual({ status: "ok", id: "ticket-1" });
    }
    for (const data of [[], [{ status: "ok", id: "one" }, { status: "ok", id: "two" }], { status: "ok" }, { status: "other" }, null]) {
      expect(parseMobilePushTicket({ data })).toEqual({ status: "error", errorCode: "InvalidResponse" });
    }
  });
  it("retains only known error codes, never a token or provider message", () => {
    expect(parseMobilePushTicket({ data: [{ status: "error", details: { error: "DeviceNotRegistered" }, message: "TOKEN/COMMAND" }] }))
      .toEqual({ status: "error", errorCode: "DeviceNotRegistered" });
    const result = parseMobilePushTicket({ data: { status: "error", details: { error: "SECRET_TOKEN" }, message: "SECRET_COMMAND" } });
    expect(result).toEqual({ status: "error", errorCode: "UnknownExpoError" });
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect(parseMobilePushTicket({ errors: [{ code: "UNAUTHORIZED", message: "secret" }] })).toEqual({ status: "error", errorCode: "UNAUTHORIZED" });
  });
  it("distinguishes delivered, provider failure, missing and malformed receipts", () => {
    expect(parseMobilePushReceipt({ data: { "ticket-1": { status: "ok" } } }, "ticket-1")).toEqual({ status: "ok" });
    expect(parseMobilePushReceipt({ data: { "ticket-1": { status: "error", details: { error: "InvalidCredentials" }, message: "secret" } } }, "ticket-1"))
      .toEqual({ status: "error", errorCode: "InvalidCredentials" });
    expect(parseMobilePushReceipt({ data: {} }, "ticket-1")).toEqual({ status: "pending" });
    expect(parseMobilePushReceipt({ data: { "ticket-1": { status: "error", details: { error: "secret" } } } }, "ticket-1"))
      .toEqual({ status: "error", errorCode: "UnknownExpoError" });
    for (const value of [undefined, { data: [] }, { data: { "ticket-1": { status: "other" } } }]) {
      expect(parseMobilePushReceipt(value, "ticket-1")).toEqual({ status: "unknown", errorCode: "InvalidResponse" });
    }
    expect(parseMobilePushReceipt({ errors: [{ code: "PUSH_TOO_MANY_RECEIPTS" }] }, "ticket-1"))
      .toEqual({ status: "unknown", errorCode: "PUSH_TOO_MANY_RECEIPTS" });
  });
});

describe("privacy-preserving push records", () => {
  it("shapes exactly six safe fields and rejects malformed persisted data", () => {
    const source = { ...base, token: "secret", title: "secret", message: "secret", permissionId: "secret", receiptId: "secret" };
    const record = mobilePushLogEntry(source);
    expect(Object.keys(record)).toEqual(["time", "deviceId", "kind", "ticketStatus", "receiptStatus", "errorCode"]);
    expect(JSON.stringify(record)).not.toContain("secret"); expect(parseMobilePushLogEntry(record)).toEqual(base);
    expect(parseMobilePushLogEntry(source)).toBeUndefined();
    for (const changed of [{ time: NaN }, { deviceId: "bad" }, { kind: "test" }, { ticketStatus: "anything" },
      { receiptStatus: "delivered" }, { errorCode: "SECRET_TOKEN" }]) expect(parseMobilePushLogEntry({ ...base, ...changed })).toBeUndefined();
    expect(() => mobilePushLogEntry({ ...base, time: -1 })).toThrow(RangeError);
  });
  it("keeps the latest attempt per device when an older receipt arrives late", () => {
    const newer = { ...base, time: base.time + 1 };
    const late = { ...base, receiptStatus: "error" as const, errorCode: "DeviceNotRegistered" as const };
    expect(lastMobilePushResults([base, newer, late])).toEqual([newer]);
    const delivered = { ...newer, receiptStatus: "ok" as const };
    expect(lastMobilePushResults([base, newer, late, delivered])).toEqual([delivered]);
  });
  it("does not mistake a successful ticket for a successful receipt", () => {
    expect(mobilePushOutcome(base)).toBe("unconfirmed");
    expect(mobilePushOutcome({ ...base, receiptStatus: "ok" })).toBe("delivered");
    expect(mobilePushOutcome({ ...base, ticketStatus: "error", receiptStatus: "none", errorCode: "SendNetworkError" })).toBe("failed");
    expect(mobilePushOutcome({ ...base, receiptStatus: "error", errorCode: "DeviceNotRegistered" })).toBe("failed");
    expect(mobilePushOutcome({ ...base, ticketStatus: "skipped", receiptStatus: "none", errorCode: "NoPushToken" })).toBe("no-token");
  });
});
