import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, get } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { decodeOffer, TestPhone } from "./test-client";

type Running = { child: ChildProcess; directory: string; main: string; mobile: string; token: string; output: () => string };
const running: Running[] = [];
async function start(mobile: boolean, host = "127.0.0.1"): Promise<Running> {
  const holders = [createServer(), createServer()];
  const ports: number[] = [];
  for (const server of holders) {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    ports.push((server.address() as { port: number }).port);
  }
  await Promise.all(holders.map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  const directory = mkdtempSync(join(tmpdir(), "yushario-relay-sec-")), token = "PUBLIC-SEC-TEST-TOKEN";
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/relay.ts", "--port", String(ports[0]), "--no-open",
    ...(mobile ? ["--mobile", `${host}:${ports[1]}`] : [])], {
    env: { ...process.env, NODE_ENV: "development", AGENT_CHARACTER_HOME: directory, AGENT_CHARACTER_TOKEN: token }, stdio: ["ignore", "pipe", "pipe"],
  });
  let text = "";
  child.stdout!.on("data", bytes => { text = (text + String(bytes)).slice(-20000); });
  child.stderr!.on("data", bytes => { text = (text + String(bytes)).slice(-20000); });
  const value = { child, directory, main: `http://127.0.0.1:${ports[0]}`, mobile: `http://127.0.0.1:${ports[1]}`, token, output: () => text };
  running.push(value);
  for (let attempt = 0; attempt < 200; attempt++) {
    if (child.exitCode !== null) throw Error(text);
    try {
      const response = await fetch(`${value.main}/api/mobile?token=${token}`, { signal: AbortSignal.timeout(100) });
      if (response.status === 200) return value;
    } catch { /* Wait for real listener startup, without any HTTP or PTY mocks. */ }
    await setTimeout(20);
  }
  throw Error(`Relay startup timeout: ${text}`);
}
async function stop(value: Running): Promise<void> {
  if (value.child.exitCode === null && value.child.signalCode === null) {
    const ended = new Promise<void>(resolve => value.child.once("exit", () => resolve()));
    value.child.kill("SIGTERM");
    const forced = globalThis.setTimeout(() => value.child.kill("SIGKILL"), 3000);
    await ended; clearTimeout(forced);
  }
  rmSync(value.directory, { recursive: true, force: true });
}
afterEach(async () => { for (const value of running.splice(0)) await stop(value); });
async function screen(value: Running, path = "", method = "GET", body?: object) {
  return fetch(`${value.main}/api/mobile${path}?token=${value.token}`, { method,
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
}

describe("mobile real process/listener isolation", () => {
  it("SEC-11 defaults off, requires an explicit bind, and warns loudly for all-interface exposure", async () => {
    const off = await start(false);
    expect(await (await screen(off)).json()).toEqual({ enabled: false });
    await expect(fetch(off.mobile + "/mobile/v1", { signal: AbortSignal.timeout(500) })).rejects.toThrow();
    const on = await start(true, "0.0.0.0");
    expect((await (await screen(on)).json()).enabled).toBe(true);
    expect(on.output()).toContain("WARNING: Mobile gateway listens on ALL interfaces");
    expect(on.output()).toContain("警告");
    expect((await fetch(on.mobile + "/api/sessions")).status).toBe(400);
  }, 15000);

  it("SEC-12 preserves screen Host/Origin/token checks and cannot cross-route either listener", async () => {
    const value = await start(true);
    expect((await fetch(value.main + "/api/mobile")).status).toBe(403);
    expect((await fetch(`${value.main}/api/mobile?token=${value.token}`, { headers: { Origin: "http://evil.invalid" } })).status).toBe(403);
    const wrongHost = await new Promise<number | undefined>((resolve, reject) => {
      get(`${value.main}/api/mobile?token=${value.token}`, { headers: { Host: "evil.invalid" } }, response => {
        response.resume(); resolve(response.statusCode);
      }).on("error", reject);
    });
    expect(wrongHost).toBe(403);
    expect((await fetch(value.main + "/mobile/v1", { method: "POST", body: "{}" })).status).toBe(404);
    expect((await fetch(`${value.mobile}/api/mobile?token=${value.token}`)).status).toBe(400);
    expect((await fetch(value.mobile + "/pty")).status).toBe(400);

    const offeredAddress = value.mobile.replace("127.0.0.1", "10.0.2.2");
    const begun = await (await screen(value, "/pair", "POST", { addresses: [offeredAddress] })).json();
    const offer = decodeOffer(begun.pairing.pairingString);
    expect(offer.addresses).toEqual([offeredAddress]);
    const phone = new TestPhone(offer);
    const pending = fetch(value.mobile + "/mobile/v1", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(phone.packet("pair", { pairingCode: offer.pairingCode, name: "HTTP phone", pushToken: null })), signal: AbortSignal.timeout(5000) });
    let state;
    for (let attempt = 0; attempt < 100; attempt++) {
      state = await (await screen(value)).json();
      if (state.pairing?.status === "pending") break;
      await setTimeout(10);
    }
    expect(state.pairing.status).toBe("pending"); expect(state.devices).toHaveLength(0);
    expect(state.pairing.sas).toMatch(/^\d{6}$/);
    const confirm = await screen(value, "/confirm", "POST", { deviceId: phone.id, approve: true });
    expect(confirm.status).toBe(200);
    expect(phone.open(await (await pending).json()).operation).toBe("pair");
    const registered = await (await screen(value)).json();
    expect(registered.devices).toHaveLength(1);
    expect(Object.keys(registered.devices[0])).toEqual(["id", "name", "createdAt", "lastSeenAt", "allowWork"]);
    expect(JSON.stringify(registered)).not.toContain("PrivateKey"); expect(JSON.stringify(registered)).not.toContain("pushToken");
    expect((await screen(value, `/devices/${phone.id}`, "DELETE")).status).toBe(200);
    expect((await fetch(value.mobile + "/mobile/v1", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(phone.packet("status")) })).status).toBe(400);
  }, 15000);
});
