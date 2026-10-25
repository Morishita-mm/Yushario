import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MobileGateway } from "./gateway";
import { GatewayFixture } from "./test-client";

let fixture: GatewayFixture;
beforeEach(async () => { fixture = await new GatewayFixture().listen(); });
afterEach(async () => { await fixture.close(); });

describe("mobile real storage failure boundaries", () => {
  it("SEC-05 refuses another gateway sharing sequence state and fails closed on a damaged registry", async () => {
    const phone = await fixture.pair();
    expect(() => new MobileGateway(join(fixture.directory, "mobile"), fixture.permissions)).toThrow(/locked/);
    expect((await fixture.post(phone.packet("status"))).status).toBe(200);
    await fixture.gateway.close();
    const state = join(fixture.directory, "mobile", "state.json");
    writeFileSync(state, "{damaged", { mode: 0o600 });
    expect(() => new MobileGateway(join(fixture.directory, "mobile"), fixture.permissions)).toThrow();
    expect(readFileSync(state, "utf8")).toBe("{damaged"); // Never silently generate new identity/sequence state.
  });

  it("SEC-05 refuses a stale legacy lock without changing state, then recovers only after deliberate lock removal", async () => {
    const phone = await fixture.pair(), directory = join(fixture.directory, "mobile");
    const state = join(directory, "state.json"), lock = join(directory, "gateway.lock"), saved = readFileSync(state);
    const owner = JSON.parse(readFileSync(lock, "utf8"));
    expect(owner).toMatchObject({ pid: process.pid, startedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) });
    await fixture.gateway.close();
    writeFileSync(lock, "2147483647", { mode: 0o600 });
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(() => new MobileGateway(directory, fixture.permissions)).toThrow(/PID=2147483647/);
      expect(readFileSync(lock, "utf8")).toBe("2147483647"); expect(readFileSync(state)).toEqual(saved);
    }
    // Only this fixture is stopped, and only its lock is removed; existing keys and sequence survive.
    rmSync(lock); fixture.gateway = new MobileGateway(directory, fixture.permissions); await fixture.listen();
    const response = await fixture.post(phone.packet("status"));
    expect(response.status).toBe(200); expect(phone.open(JSON.parse(response.text)).operation).toBe("status");
  });

  it.each(["structured", "malformed"])("SEC-05 refuses a %s lock with a safe bilingual single-file recovery message", kind => {
    const directory = join(fixture.directory, "quoted ' home", "mobile"), lock = join(directory, "gateway.lock");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const startedAt = "2026-10-22T15:00:00.000Z";
    const contents = kind === "structured" ? JSON.stringify({ pid: 2147483647, startedAt }) : "DO-NOT-PRINT-RAW-LOCK-CONTENTS";
    writeFileSync(lock, contents, { mode: 0o600 });
    let message = "";
    try { new MobileGateway(directory, fixture.permissions); } catch (error) { message = (error as Error).message; }
    expect(message).toContain("Mobile data locked"); expect(message).toContain("ロック中");
    expect(message).toContain("confirm no Yushario with this AGENT_CHARACTER_HOME is running"); expect(message).toContain("keep state.json");
    expect(message).toContain(`rm -- '${lock.replaceAll("'", "'\\''")}'`); expect(message).not.toMatch(/[\r\n]/);
    if (kind === "structured") { expect(message).toContain("PID=2147483647"); expect(message).toContain(startedAt); }
    else expect(message).not.toContain(contents);
    expect(readFileSync(lock, "utf8")).toBe(contents); expect(existsSync(join(directory, "state.json"))).toBe(false);
  });

  it("SEC-05 never executes a decision or encrypts success when sequence persistence fails", async () => {
    const phone = await fixture.pair(), state = join(fixture.directory, "mobile", "state.json");
    const saved = readFileSync(state);
    const held = fixture.permissions.wait({ type: "permission", id: "p", terminal: "t", tool: "Bash", summary: "Bash: pwd",
      content: "pwd", omitted: 0, expiresAt: Date.now() + 120000 }, true);
    const view = fixture.gateway.permissionViews()[0], body = { permissionId: view.id, contentHash: view.contentHash, decision: "allow" };
    rmSync(state); mkdirSync(state); // Actual rename failure; no FS mocks.
    const failed = await fixture.post(phone.packet("decide", body));
    expect(failed.status).toBe(400); expect(failed.text).toBe('{"error":"rejected"}');
    expect(fixture.permissions.pending).toHaveLength(1); expect(fixture.gateway.store.devices[0].lastSeq).toBe(1);
    rmSync(state, { recursive: true }); writeFileSync(state, saved, { mode: 0o600 });
    expect((await fixture.post(phone.packet("decide", body))).status).toBe(200); expect(await held).toBe("allow");
  });
});
