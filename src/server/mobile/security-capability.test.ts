import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { handleMobileApi } from "./api";
import { GatewayFixture } from "./test-client";

let fixture: GatewayFixture, screen: Server, origin = "";
beforeEach(async () => {
  fixture = await new GatewayFixture().listen();
  // The real Mac API handler over real HTTP; relay's Host/Origin/token check runs before it for every /api/mobile/* path.
  screen = createServer((request, response) => {
    void handleMobileApi(request, response, new URL(request.url ?? "/", "http://127.0.0.1"), fixture.gateway);
  });
  await new Promise<void>(resolve => screen.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(screen.address() as { port: number }).port}`;
});
afterEach(async () => {
  await new Promise<void>(resolve => screen.close(() => resolve()));
  await fixture.close();
});
async function work(id: string, body: unknown, method = "POST") {
  const response = await fetch(`${origin}/api/mobile/devices/${encodeURIComponent(id)}/work`, { method,
    ...(method === "POST" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  return { status: response.status, text: await response.text() };
}

describe("mobile per-device work opt-in", () => {
  it("defaults off, persists the Mac choice across restart, and never resets identity or sequence", async () => {
    const phone = await fixture.pair();
    expect(fixture.gateway.store.devices[0].allowWork).toBe(false);
    expect((await fixture.post(phone.packet("status"))).status).toBe(200);
    const before = fixture.gateway.store.devices[0];
    fixture.gateway.store.setAllowWork(phone.id, true);
    await fixture.restart();
    expect(fixture.gateway.store.devices[0]).toEqual({ ...before, allowWork: true });
    expect(() => fixture.gateway.store.setAllowWork("A".repeat(43), true)).toThrow();
    expect(() => fixture.gateway.store.setAllowWork(phone.id, "false" as unknown as boolean)).toThrow();
    fixture.gateway.store.setAllowWork(phone.id, false);
    expect(fixture.gateway.store.devices[0]).toEqual(before);
    // Later sequence/push updates keep the stored choice instead of reverting to the default.
    fixture.gateway.store.setAllowWork(phone.id, true);
    expect((await fixture.post(phone.packet("status"))).status).toBe(200);
    expect(fixture.gateway.store.devices[0]).toMatchObject({ allowWork: true, lastSeq: 3 });
  });

  it("loads legacy records without the field as opted out, keeping keys and replay protection", async () => {
    const phone = await fixture.pair();
    const replay = phone.packet("status");
    expect((await fixture.post(replay)).status).toBe(200);
    await fixture.gateway.close();
    const file = join(fixture.directory, "mobile", "state.json"), state = JSON.parse(readFileSync(file, "utf8"));
    for (const device of state.devices) delete device.allowWork;
    writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
    await fixture.restart();
    expect(fixture.gateway.store.devices[0]).toMatchObject({ id: phone.id, allowWork: false, lastSeq: 2,
      phoneSigningKey: phone.identity.signingPublicKey, phoneEncryptionKey: phone.identity.encryptionPublicKey });
    expect(fixture.gateway.store.identity.signingPrivateKey).toBe(state.signingPrivateKey);
    expect((await fixture.post(replay)).status).toBe(400);
    const next = await fixture.post(phone.packet("status"));
    expect(next.status).toBe(200); expect(phone.open(JSON.parse(next.text)).operation).toBe("status");
    // The migrated record is written back with the explicit default on the next save.
    expect(JSON.parse(readFileSync(file, "utf8")).devices[0].allowWork).toBe(false);
  });

  it("fails closed on a stored non-boolean choice", async () => {
    await fixture.pair();
    await fixture.gateway.close();
    const file = join(fixture.directory, "mobile", "state.json"), state = JSON.parse(readFileSync(file, "utf8"));
    state.devices[0].allowWork = "yes";
    writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
    const saved = readFileSync(file, "utf8");
    await expect(fixture.restart()).rejects.toThrow(/Invalid mobile state/);
    expect(readFileSync(file, "utf8")).toBe(saved);
    fixture.gateway = { close: async () => undefined } as unknown as typeof fixture.gateway; // Nothing was opened.
  });

  it("changes the choice only through the strict Mac API shape for a known device", async () => {
    const phone = await fixture.pair();
    const enabled = await work(phone.id, { enabled: true });
    expect(enabled.status).toBe(200); expect(JSON.parse(enabled.text).enabled).toBe(true);
    expect(fixture.gateway.store.devices[0].allowWork).toBe(true);
    for (const body of [{ enabled: "false" }, { enabled: 0 }, { enabled: false, extra: 1 }, {}, [false], null]) {
      expect(await work(phone.id, body)).toEqual({ status: 400, text: '{"error":"rejected"}' });
    }
    expect((await work(phone.id, undefined, "GET")).status).toBe(400);
    expect((await work(phone.id, undefined, "DELETE")).status).toBe(400);
    expect((await work("A".repeat(43), { enabled: false })).status).toBe(400);
    expect((await work("not-an-id", { enabled: false })).status).toBe(400);
    expect(fixture.gateway.store.devices[0].allowWork).toBe(true);
    expect((await work(phone.id, { enabled: false })).status).toBe(200);
    expect(fixture.gateway.store.devices[0].allowWork).toBe(false);
    // The existing device route still accepts only DELETE.
    expect((await fetch(`${origin}/api/mobile/devices/${phone.id}`, { method: "POST", body: '{"enabled":true}' })).status).toBe(400);
    expect(fixture.gateway.store.devices[0].allowWork).toBe(false);
  });
});
