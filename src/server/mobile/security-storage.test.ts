import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
