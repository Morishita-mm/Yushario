import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { mobilePushPayload } from "../../core/mobile-pairing";
import type { Permission } from "../../core/permissions";
import { GatewayFixture } from "./test-client";
import { mobileEncrypt } from "./crypto";
import { mobileAad, mobileNonce } from "../../core/mobile-signing";

let fixture: GatewayFixture;
beforeEach(async () => { fixture = await new GatewayFixture().listen(); });
afterEach(async () => { vi.restoreAllMocks(); await fixture.close(); });
const permission = (id = "permission-1"): Permission => ({ type: "permission", id, terminal: "terminal-1", agent: "hero-1", name: "Hero",
  tool: "Bash", summary: "Bash: echo secret", content: "echo SECRET_COMMAND_PATH", omitted: 0, expiresAt: Date.now() + 120000 });

describe("mobile real HTTP request security", () => {
  it("SEC-05 accepts only increasing sequences in the inclusive +/-60s window and rejects approval replay after restart", async () => {
    const now = Date.now(); vi.spyOn(Date, "now").mockReturnValue(now);
    const phone = await fixture.pair();
    for (const [seq, delta, status] of [[2, -60000, 200], [3, 60000, 200], [4, -60001, 400], [5, 60001, 400], [3, 0, 400]]) {
      expect((await fixture.post(phone.packet("status", {}, seq, now + delta))).status).toBe(status);
    }
    const old = phone.packet("status", {}, 6, now);
    expect((await fixture.post(old)).status).toBe(200);
    const publicKey = fixture.gateway.store.identity.encryptionPublicKey;
    await fixture.restart();
    expect(fixture.gateway.store.identity.encryptionPublicKey).toBe(publicKey);
    expect((await fixture.post(old)).status).toBe(400);
    expect((await fixture.post(phone.packet("status", {}, 7, now))).status).toBe(200);
    const held = fixture.permissions.wait(permission(), true);
    const displayed = fixture.gateway.permissionViews()[0];
    const decision = phone.packet("decide", { permissionId: displayed.id, contentHash: displayed.contentHash, decision: "allow" }, 8, now);
    expect((await fixture.post(decision)).status).toBe(200); expect(await held).toBe("allow");
    expect((await fixture.post(decision)).text).toBe('{"error":"rejected"}');
  });

  it("SEC-06 rejects modified AEAD ciphertext and authenticates encrypted signed responses", async () => {
    const phone = await fixture.pair();
    const packet = phone.packet("status");
    const bytes = Buffer.from(packet.ciphertext, "base64url"); bytes[10] ^= 1;
    expect((await fixture.post({ ...packet, ciphertext: bytes.toString("base64url") })).status).toBe(400);
    const invalid = phone.packet("status");
    invalid.ciphertext = mobileEncrypt(Buffer.from([0xff]), phone.requestKey, mobileNonce(invalid.seq), mobileAad("request", phone.id, invalid.seq, phone.keys)).toString("base64url");
    expect((await fixture.post(invalid)).status).toBe(400); // Valid AEAD, invalid UTF-8.
    const badJson = await fetch(fixture.origin + "/mobile/v1", { method: "POST", headers: { "Content-Type": "application/json" }, body: Buffer.from([0xff]) });
    expect(badJson.status).toBe(400); expect(await badJson.text()).toBe('{"error":"rejected"}');
    const response = await fixture.post(phone.packet("status"));
    expect(phone.open(JSON.parse(response.text)).operation).toBe("status");
    const encrypted = JSON.parse(response.text);
    const modified = Buffer.from(encrypted.ciphertext, "base64url"); modified[modified.length - 1] ^= 1;
    expect(() => phone.open({ ...encrypted, ciphertext: modified.toString("base64url") })).toThrow();
  });

  it("SEC-07 sends only fixed content-free push fields and keeps permission content inside AEAD", async () => {
    const phone = await fixture.pair();
    for (const [kind, body] of [["permission", "確認が必要です"], ["report", "報告が届きました"], ["error", "勇者が止まりました"]] as const) {
      expect(mobilePushPayload(kind)).toEqual({ priority: "high", channelId: "alerts", title: "Yushario", body, data: { kind } });
    }
    const held = fixture.permissions.wait(permission(), true);
    const response = await fixture.post(phone.packet("permissions"));
    expect(response.text).not.toContain("SECRET_COMMAND_PATH"); expect(response.text).not.toContain("Bash");
    const decoded = phone.open(JSON.parse(response.text));
    expect(decoded.operation).toBe("permissions");
    if (decoded.operation === "permissions") expect(decoded.body.permissions[0].content).toBe("echo SECRET_COMMAND_PATH");
    fixture.permissions.cancel(); expect(await held).toBe("terminal");
  });

  it("SEC-08 deletes push tokens on unpair and never treats a notification or token as authorization", async () => {
    const phone = await fixture.pair(), token = "ExponentPushToken[PUBLIC-TEST-TOKEN]";
    expect((await fixture.post(phone.packet("push-token", { token }))).status).toBe(200);
    expect(fixture.gateway.store.devices[0].pushToken).toBe(token);
    expect((await fixture.post(mobilePushPayload("permission"))).status).toBe(400);
    expect((await fixture.post({ token, operation: "decide" })).status).toBe(400);
    expect((await fixture.post(phone.packet("unpair"))).status).toBe(200);
    expect(fixture.gateway.store.devices).toHaveLength(0);
    expect(readFileSync(join(fixture.directory, "mobile", "state.json"), "utf8")).not.toContain(token);
    expect((await fixture.post(phone.packet("status"))).status).toBe(400);
  });

  it("SEC-12 accepts only the allowlist on its own POST endpoint and refuses Origin/browser routes", async () => {
    const phone = await fixture.pair();
    for (const path of ["/api/sessions", "/api/mobile", "/ws", "/pty", "/event", "/mobile/v1?token=anything"]) {
      expect((await fixture.post(phone.packet("status"), path)).status).toBe(400);
    }
    expect((await fixture.post(phone.packet("exec", { command: "pwd" }))).status).toBe(400);
    expect((await fixture.post(phone.packet("status", { command: "pwd" }))).status).toBe(400);
    expect((await fixture.post(phone.packet("status"), "/mobile/v1", { Origin: fixture.origin })).status).toBe(400);
    expect((await fetch(fixture.origin + "/mobile/v1")).status).toBe(400);
    const version = await fixture.post({ v: 2 });
    expect(version.status).toBe(426); expect(version.text).toBe('{"error":"version","supportedVersion":1}');
    expect((await fixture.post({ v: "2" })).status).toBe(400);
  });

  it("SEC-13 bounds body size and per-socket-IP request rate without forwarded-header bypass", async () => {
    const tooLarge = await fixture.post({ padding: "x".repeat(1048576) });
    expect(tooLarge.status).toBe(400); expect(tooLarge.text).toBe('{"error":"rejected"}');
    await fixture.restart();
    const now = Date.now(); vi.spyOn(Date, "now").mockReturnValue(now);
    const phone = await fixture.pair();
    for (let seq = 2; seq <= 30; seq++) expect((await fixture.post(phone.packet("status", {}, seq, now))).status).toBe(200);
    const limited = await fixture.post(phone.packet("status", {}, 31, now), "/mobile/v1", { "X-Forwarded-For": "192.0.2.99" });
    expect(limited.status).toBe(400); expect(limited.text).toBe('{"error":"rejected"}');
    expect(limited.headers.has("retry-after")).toBe(false);
  });

  it("SEC-14 binds decisions to the exact displayed content, expiry and first answer", async () => {
    const phone = await fixture.pair(), card = permission();
    const held = fixture.permissions.wait(card, true), displayed = fixture.gateway.permissionViews()[0];
    card.content = "CHANGED_COMMAND";
    const body = { permissionId: card.id, contentHash: displayed.contentHash, decision: "allow" };
    expect((await fixture.post(phone.packet("decide", body))).status).toBe(400);
    expect(fixture.permissions.pending).toHaveLength(1);
    card.content = "echo SECRET_COMMAND_PATH"; card.omitted = 1;
    const omitted = fixture.gateway.permissionViews()[0];
    expect((await fixture.post(phone.packet("decide", { ...body, contentHash: omitted.contentHash }))).status).toBe(400);
    expect(fixture.permissions.decide(card.id, "deny")).toBe(true); expect(await held).toBe("deny");
    expect((await fixture.post(phone.packet("decide", body))).status).toBe(400);
    const expired = permission("expired"); expired.expiresAt = Date.now() - 1;
    expect(await fixture.permissions.wait(expired, true)).toBe("terminal");
    expect((await fixture.post(phone.packet("decide", { ...body, permissionId: "expired" }))).status).toBe(400);
  });

  it("SEC-15 durably logs only who/permission/result/time, and audit failure prevents the decision", async () => {
    const phone = await fixture.pair(), held = fixture.permissions.wait(permission(), true);
    const displayed = fixture.gateway.permissionViews()[0], body = { permissionId: displayed.id, contentHash: displayed.contentHash, decision: "allow" };
    const audit = join(fixture.directory, "mobile", "approvals.jsonl");
    mkdirSync(audit); // A real filesystem failure, not an audit or permission mock.
    expect((await fixture.post(phone.packet("decide", body))).status).toBe(400);
    expect(fixture.permissions.pending).toHaveLength(1);
    rmSync(audit, { recursive: true });
    expect((await fixture.post(phone.packet("decide", body))).status).toBe(200); expect(await held).toBe("allow");
    const text = readFileSync(audit, "utf8"), entry = JSON.parse(text.trim());
    expect(Object.keys(entry)).toEqual(["deviceId", "permissionId", "result", "time"]);
    expect(entry).toMatchObject({ deviceId: phone.id, permissionId: displayed.id, result: "allow" });
    expect(text).not.toContain("SECRET_COMMAND_PATH"); expect(text).not.toContain("Bash");
    expect(statSync(audit).mode & 0o777).toBe(0o600);
  });
});
