import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server, type ServerResponse } from "node:http";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { GatewayFixture, type TestPhone, until } from "./test-client";
import { handleMobileApi } from "./api";

// All HTTP listeners, crypto, state and logs are real and isolated. Only Expo's destination is redirected.
let fixture: GatewayFixture, expo: Server, mac: Server, macOrigin: string;
let sent: Record<string, any>[], held: ServerResponse[], attempts: number;
let ticketError: boolean, networkError: boolean, hold: boolean;
const tokens = ["ExponentPushToken[PUBLIC_TEST_ONE]", "ExponentPushToken[PUBLIC_TEST_TWO]"];
async function listen(server: Server): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
function accepted(response: ServerResponse, id: number): void {
  response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ data: { status: "ok", id: `ticket-${id}` } }));
}
beforeEach(async () => {
  sent = []; held = []; attempts = 0; ticketError = networkError = hold = false;
  expo = createServer(async (request, response) => {
    let text = ""; for await (const chunk of request) text += chunk;
    const body = JSON.parse(text);
    if (request.url?.endsWith("/send")) {
      sent.push(body);
      if (hold) { held.push(response); return; }
      if (ticketError) { response.end(JSON.stringify({ data: { status: "error", details: { error: "MessageRateExceeded" } } })); return; }
      accepted(response, sent.length);
    } else response.end(JSON.stringify({ data: Object.fromEntries(body.ids.map((id: string) => [id, { status: "ok" }])) }));
  });
  const expoOrigin = await listen(expo), realFetch = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation((url, options) => {
    if (String(url).startsWith("https://exp.host/")) {
      if (String(url).endsWith("/send")) { attempts++; if (networkError) return Promise.reject(Error("synthetic offline")); }
      return realFetch(expoOrigin + new URL(String(url)).pathname, options);
    }
    return realFetch(url, options);
  });
  fixture = await new GatewayFixture().listen();
  mac = createServer((request, response) => { void handleMobileApi(request, response, new URL(request.url ?? "/", "http://127.0.0.1"), fixture.gateway); });
  macOrigin = await listen(mac);
});
afterEach(async () => {
  await fixture.close();
  for (const server of [mac, expo]) await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
  vi.restoreAllMocks();
});
async function phone(index = 0): Promise<TestPhone> {
  const phone = await fixture.pair("同じ端末名");
  expect((await fixture.post(phone.packet("push-token", { token: tokens[index] }))).status).toBe(200);
  return phone;
}
async function marked(id: string, kind: "permission" | "report" | "error"): Promise<void> {
  await until(() => fixture.gateway.store.devices.find(d => d.id === id)!.notifiedKinds.includes(kind));
}
async function settle(): Promise<void> { await setTimeout(50); }

describe("SEC-07/08 A7 notification onboarding over real gateway and fake Expo HTTP", () => {
  it("sends only fixed kind-specific copy and bounds permission TTL to its actual expiry", async () => {
    const p = await phone(), expiresAt = Date.now() + 60500;
    void fixture.permissions.wait({ type: "permission", id: "synthetic-permission", agent: "PRIVATE_HERO", terminal: "synthetic-terminal",
      name: "PRIVATE_HERO", tool: "Bash", summary: "PRIVATE_WORK", content: "PRIVATE_COMMAND", omitted: 0, expiresAt }, true);
    for (const kind of ["permission", "report", "error"] as const) fixture.gateway.notify(kind, expiresAt);
    await until(() => sent.length === 3); await marked(p.id, "permission");
    const expected = { permission: "確認が必要です", report: "報告が届きました", error: "勇者が止まりました" };
    for (const row of sent) {
      const kind = row.data.kind as keyof typeof expected;
      expect(row).toMatchObject({ to: tokens[0], title: "Yushario", body: expected[kind], priority: "high", channelId: "alerts", data: { kind } });
      expect(Object.keys(row).sort()).toEqual(["body", "channelId", "data", "priority", "title", "to", ...(kind === "permission" ? ["ttl"] : [])].sort());
      if (kind === "permission") { expect(row.ttl).toBeGreaterThanOrEqual(59); expect(row.ttl).toBeLessThanOrEqual(60); }
    }
    expect(JSON.stringify(sent)).not.toContain("PRIVATE_");
    expect((await fixture.post(p.packet("status"))).status).toBe(200);
    fixture.gateway.notify("permission", Date.now() - 1);
    fixture.gateway.notify("permission", Date.now() + 999);
    await settle(); expect(sent).toHaveLength(3);
    const log = readFileSync(join(fixture.gateway.store.directory, "push-delivery.jsonl"), "utf8");
    for (const text of [...tokens, "PRIVATE_", ...Object.values(expected), "ticket-"]) expect(log).not.toContain(text);
    for (const row of log.trim().split("\n").map(line => JSON.parse(line))) {
      expect(Object.keys(row).sort()).toEqual(["deviceId", "errorCode", "kind", "receiptStatus", "ticketStatus", "time"]);
    }
  });

  it("suppresses per-device/per-kind until authenticated contact, including across restart", async () => {
    const a = await phone(), b = await phone(1);
    fixture.gateway.notify("report"); fixture.gateway.notify("report");
    await marked(a.id, "report"); await marked(b.id, "report"); expect(sent).toHaveLength(2);
    fixture.gateway.notify("error"); await marked(a.id, "error"); await marked(b.id, "error"); expect(sent).toHaveLength(4);
    fixture.gateway.notify("report"); fixture.gateway.notify("error"); await settle(); expect(sent).toHaveLength(4);
    const invalid = a.packet("status", {}, a.seq++, Date.now(), "A".repeat(86));
    expect((await fixture.post(invalid)).status).toBe(400);
    fixture.gateway.notify("report"); await settle(); expect(sent).toHaveLength(4);
    const contact = b.packet("status");
    expect((await fixture.post(contact)).status).toBe(200);
    fixture.gateway.notify("report"); await marked(b.id, "report");
    expect(sent).toHaveLength(5); expect(sent.at(-1)!.to).toBe(tokens[1]);
    expect((await fixture.post(contact)).status).toBe(400);
    fixture.gateway.notify("report"); await settle(); expect(sent).toHaveLength(5);
    await fixture.restart(); fixture.gateway.notify("report"); await settle(); expect(sent).toHaveLength(5);
    expect((await fixture.post(a.packet("permissions"))).status).toBe(200);
    fixture.gateway.notify("report"); await marked(a.id, "report"); expect(sent).toHaveLength(6);
    expect(sent.at(-1)!.to).toBe(tokens[0]);
    expect(readdirSync(fixture.gateway.store.directory).sort()).toEqual(["gateway.lock", "push-delivery.jsonl", "state.json"]);
  });

  it("does not suppress after network/ticket failure, while explicit Mac test pushes always send", async () => {
    const p = await phone(); networkError = true;
    fixture.gateway.notify("report");
    await until(() => fixture.gateway.snapshot().pushResults[0]?.errorCode === "SendNetworkError");
    expect(fixture.gateway.store.devices[0].notifiedKinds).toEqual([]);
    networkError = false; ticketError = true; fixture.gateway.notify("report");
    await until(() => fixture.gateway.snapshot().pushResults[0]?.errorCode === "MessageRateExceeded");
    expect(fixture.gateway.store.devices[0].notifiedKinds).toEqual([]);
    ticketError = false; fixture.gateway.notify("report"); await marked(p.id, "report"); expect(attempts).toBe(3);
    fixture.gateway.notify("report"); await settle(); expect(attempts).toBe(3);
    for (let i = 0; i < 2; i++) {
      const result = await fetch(macOrigin + "/api/mobile/test-push", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: p.id }) });
      expect(result.status).toBe(200);
    }
    await until(() => attempts === 5); await settle();
    expect(sent.slice(-2).every(row => row.data.kind === "permission" && row.ttl > 0 && row.ttl <= 120)).toBe(true);
    expect(fixture.gateway.store.devices[0].notifiedKinds).toEqual(["report"]);
    fixture.gateway.notify("permission", Date.now() + 120000); await marked(p.id, "permission"); expect(attempts).toBe(6);
    expect((await fixture.post(p.packet("push-token", { token: null }))).status).toBe(200);
    fixture.gateway.notify("report");
    expect(fixture.gateway.snapshot().pushResults[0]?.errorCode).toBe("NoPushToken");
    expect(fixture.gateway.store.devices[0].notifiedKinds).toEqual([]); expect(attempts).toBe(6);
    expect((await fixture.post(p.packet("push-token", { token: tokens[0] }))).status).toBe(200);
    fixture.gateway.notify("report"); await marked(p.id, "report"); expect(attempts).toBe(7);
  });

  it("does not let a late ticket suppress a phone that connected after the send started", async () => {
    const p = await phone(); hold = true;
    fixture.gateway.notify("report"); await until(() => held.length === 1);
    fixture.gateway.notify("report"); await settle(); expect(attempts).toBe(1);
    expect((await fixture.post(p.packet("status"))).status).toBe(200);
    accepted(held[0], 1); await until(() => fixture.gateway.snapshot().pushResults[0]?.ticketStatus === "ok");
    expect(fixture.gateway.store.devices[0].notifiedKinds).toEqual([]);
    fixture.gateway.notify("report"); await until(() => held.length === 2);
    accepted(held[1], 2); await marked(p.id, "report"); expect(attempts).toBe(2);
  });

  it("loads old records without suppression marks and rejects malformed marks without altering the file", async () => {
    const p = await phone(); fixture.gateway.store.setAllowWork(p.id, true);
    const file = join(fixture.gateway.store.directory, "state.json");
    await fixture.gateway.close();
    const state = JSON.parse(readFileSync(file, "utf8")); delete state.devices[0].notifiedKinds;
    writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
    await fixture.restart();
    expect(fixture.gateway.store.devices[0]).toMatchObject({ id: p.id, allowWork: true, lastSeq: 2, notifiedKinds: [] });
    fixture.gateway.notify("report"); await marked(p.id, "report");
    await fixture.gateway.close();
    const malformed = JSON.parse(readFileSync(file, "utf8")); malformed.devices[0].notifiedKinds = ["report", "report"];
    writeFileSync(file, JSON.stringify(malformed), { mode: 0o600 });
    const saved = readFileSync(file, "utf8");
    await expect(fixture.restart()).rejects.toThrow(/Invalid mobile state/);
    expect(readFileSync(file, "utf8") === saved).toBe(true);
    // A failed constructor did not open a new gateway; the closed instance remains safe to close again.
  });
});
