import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateMobileIdentity } from "./crypto";
import { MobilePush } from "./push";
import { MobileStore } from "./store";

// Only the external Expo boundary and elapsed polling time are faked. Store/log/keys are real.
let directory: string, store: MobileStore, push: MobilePush;
const id = Buffer.alloc(32, 1).toString("base64url"), otherId = Buffer.alloc(32, 2).toString("base64url");
const token = "ExponentPushToken[PUBLIC_TEST_TOKEN]";
const json = (value: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(value), { status }));
beforeEach(() => {
  vi.useFakeTimers();
  directory = mkdtempSync(join(tmpdir(), "yushario-push-test-")); store = new MobileStore(join(directory, "mobile"));
  const phone = generateMobileIdentity();
  store.put({ id, phoneEncryptionKey: phone.encryptionPublicKey, phoneSigningKey: phone.signingPublicKey, name: "Test phone",
    pushToken: token, createdAt: Date.now(), lastSeenAt: Date.now(), lastSeq: 1 });
  push = new MobilePush(store);
});
afterEach(async () => {
  push.close(); await vi.advanceTimersByTimeAsync(0); store.close();
  rmSync(directory, { recursive: true, force: true }); vi.useRealTimers(); vi.restoreAllMocks();
});

describe("Expo push ticket/receipt delivery (no real pushes)", () => {
  it("checks receipts after a delay and logs no tokens/content, while a tokenless device does not block sending", async () => {
    store.put({ ...store.devices[0], id: otherId, name: "No-token phone", pushToken: null });
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(url => String(url).endsWith("/send")
      ? json({ data: { status: "ok", id: "ticket-1" } }) : json({ data: { "ticket-1": { status: "ok" } } }));
    push.notify("permission"); await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({ to: token, priority: "high", title: "Yushario", body: "確認が必要です", data: { kind: "permission" } });
    expect(push.results().find(entry => entry.deviceId === id)?.receiptStatus).toBe("pending");
    expect(push.results().find(entry => entry.deviceId === otherId)?.errorCode).toBe("NoPushToken");
    await vi.advanceTimersByTimeAsync(4999); expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[1][0])).toBe("https://exp.host/--/api/v2/push/getReceipts");
    expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toEqual({ ids: ["ticket-1"] });
    expect(push.results().find(entry => entry.deviceId === id)).toMatchObject({ ticketStatus: "ok", receiptStatus: "ok", errorCode: null });
    const log = readFileSync(join(store.directory, "push-delivery.jsonl"), "utf8");
    expect(log).not.toContain(token); expect(log).not.toContain("ticket-1"); expect(log).not.toContain("確認が必要です");
  });

  it("accepts a single-array ticket and removes the same token on receipt DeviceNotRegistered", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(url => String(url).endsWith("/send")
      ? json({ data: [{ status: "ok", id: "ticket-1" }] })
      : json({ data: { "ticket-1": { status: "error", details: { error: "DeviceNotRegistered" }, message: token } } }));
    push.notify("report"); await vi.advanceTimersByTimeAsync(5000);
    expect(push.results()[0]).toMatchObject({ kind: "report", ticketStatus: "ok", receiptStatus: "error", errorCode: "DeviceNotRegistered" });
    expect(store.devices[0].pushToken).toBeNull();
    expect(JSON.stringify(push.log.entries)).not.toContain(token);
  });

  it("does not overwrite a newer result or delete an updated token when an old receipt arrives late", async () => {
    const replacement = "ExponentPushToken[NEW_PUBLIC_TEST_TOKEN]"; let oldReceipts = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation((url, options) => {
      const body = JSON.parse(String(options?.body));
      if (String(url).endsWith("/send")) return json({ data: { status: "ok", id: body.to === token ? "old" : "new" } });
      if (body.ids[0] === "new") return json({ data: { new: { status: "ok" } } });
      return json({ data: ++oldReceipts === 1 ? {} : { old: { status: "error", details: { error: "DeviceNotRegistered" } } } });
    });
    push.notify("permission"); await vi.advanceTimersByTimeAsync(1000);
    store.setPushToken(id, replacement); push.notify("error");
    await vi.advanceTimersByTimeAsync(5000); expect(push.results()[0]).toMatchObject({ kind: "error", receiptStatus: "ok" });
    await vi.advanceTimersByTimeAsync(29000);
    expect(push.log.entries.at(-1)?.errorCode).toBe("DeviceNotRegistered");
    expect(push.results()[0]).toMatchObject({ kind: "error", receiptStatus: "ok" });
    expect(store.devices[0].pushToken).toBe(replacement);
  });

  it("marks missing receipts unconfirmed after bounded polls without resending a push", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(url => String(url).endsWith("/send")
      ? json({ data: { status: "ok", id: "ticket-1" } }) : json({ data: {} }));
    push.notify("permission"); await vi.advanceTimersByTimeAsync(155000);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/send"))).toHaveLength(1);
    expect(push.results()[0]).toMatchObject({ ticketStatus: "ok", receiptStatus: "unknown", errorCode: "ReceiptNotFound" });
  });

  it("records ticket errors and transport failures without exposing provider messages", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementationOnce(() => json({ data: [{ status: "error", details: { error: "DeviceNotRegistered" }, message: token }] }))
      .mockRejectedValueOnce(Error(token));
    push.notify("permission"); await vi.advanceTimersByTimeAsync(0);
    expect(store.devices[0].pushToken).toBeNull(); expect(push.results()[0].errorCode).toBe("DeviceNotRegistered");
    store.setPushToken(id, token); push.notify("error"); await vi.advanceTimersByTimeAsync(0);
    expect(push.results()[0]).toMatchObject({ ticketStatus: "error", errorCode: "SendNetworkError" });
    expect(fetch).toHaveBeenCalledTimes(2); expect(JSON.stringify(push.log.entries)).not.toContain(token);
  });

  it("logs an explicit skip when only the target device has no token", () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(Error("Unexpected Expo request"));
    store.setPushToken(id, null); push.notify("permission", id);
    expect(fetch).not.toHaveBeenCalled();
    expect(push.results()[0]).toMatchObject({ ticketStatus: "skipped", receiptStatus: "none", errorCode: "NoPushToken" });
  });

  it("keeps receipt transport failures unconfirmed and preserves only safe codes", async () => {
    let receipt = 0;
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(url => {
      if (String(url).endsWith("/send")) return json({ data: { status: "ok", id: "ticket-1" } });
      if (++receipt === 1) return Promise.reject(Error(token));
      return receipt === 2 ? json({ errors: [{ code: "UNAUTHORIZED", message: token }] }, 401) : Promise.resolve(new Response("invalid", { status: 503 }));
    });
    push.notify("permission"); await vi.advanceTimersByTimeAsync(5000);
    expect(push.results()[0]).toMatchObject({ ticketStatus: "ok", receiptStatus: "unknown", errorCode: "ReceiptNetworkError" });
    await vi.advanceTimersByTimeAsync(30000); expect(push.results()[0].errorCode).toBe("UNAUTHORIZED");
    await vi.advanceTimersByTimeAsync(120000); expect(push.results()[0].errorCode).toBe("ReceiptHttpError");
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/send"))).toHaveLength(1);
    expect(JSON.stringify(push.log.entries)).not.toContain(token);
  });

  it("marks a stopped pending receipt unknown and makes no later requests", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => json({ data: { status: "ok", id: "ticket-1" } }));
    push.notify("permission"); await vi.advanceTimersByTimeAsync(0); push.close();
    await vi.advanceTimersByTimeAsync(155000);
    expect(fetch).toHaveBeenCalledTimes(1); expect(push.results()[0]).toMatchObject({ ticketStatus: "ok", receiptStatus: "unknown", errorCode: "GatewayStopped" });
  });

  it("cancels receipt work on close and bounds in-flight jobs", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(Error("aborted")), { once: true });
    }));
    for (let index = 0; index < 51; index++) push.notify("permission");
    expect(fetch).toHaveBeenCalledTimes(50); expect(push.results()[0].errorCode).toBe("QueueFull");
    push.close(); await vi.advanceTimersByTimeAsync(0);
    expect(fetch.mock.calls.every(([, options]) => options?.signal?.aborted)).toBe(true);
    expect(push.results()[0].errorCode).toBe("QueueFull");
  });
});
