import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTimeout } from "node:timers/promises";
import { statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { generateMobileIdentity, mobileSas } from "./crypto";
import { decodeOffer, GatewayFixture, TestPhone, until } from "./test-client";

let fixture: GatewayFixture;
beforeEach(async () => { fixture = await new GatewayFixture().listen(); });
afterEach(async () => { vi.restoreAllMocks(); await fixture.close(); });
const pairBody = (phone: TestPhone) => ({ pairingCode: phone.offer.pairingCode, name: "Test phone", pushToken: null });

describe("mobile real HTTP pairing security", () => {
  it("SEC-01 rejects unregistered devices and invalid Ed25519 signatures with identical generic errors", async () => {
    const phone = await fixture.pair();
    const stranger = new TestPhone(phone.offer);
    const unknown = await fixture.post(stranger.packet("status"));
    const badSignature = await fixture.post(phone.packet("status", {}, 2, Date.now(), Buffer.alloc(64).toString("base64url")));
    expect(unknown.status).toBe(400); expect(unknown.text).toBe('{"error":"rejected"}');
    expect(badSignature.text).toBe(unknown.text); expect(badSignature.status).toBe(400);
    expect(fixture.gateway.store.devices[0].lastSeq).toBe(1);
  });

  it("SEC-02 expires codes exactly after five minutes, allows one use, and caps registration at five devices", async () => {
    const now = Date.now(); const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const offer = decodeOffer(fixture.gateway.startPairing().pairing!.pairingString!);
    expect(offer.expiresAt).toBe(now + 300000);
    const expired = new TestPhone(offer);
    clock.mockReturnValue(now + 300000);
    expect((await fixture.post(expired.packet("pair", pairBody(expired)))).status).toBe(400);
    expect(fixture.gateway.store.devices).toHaveLength(0);
    clock.mockRestore();
    const phone = await fixture.pair("Phone 1");
    expect((await fixture.post(phone.packet("pair", pairBody(phone), 1))).status).toBe(400);
    for (let index = 2; index <= 5; index++) await fixture.pair(`Phone ${index}`);
    expect(fixture.gateway.store.devices).toHaveLength(5);
    expect(() => fixture.gateway.startPairing()).toThrow();
    const sixth = new TestPhone(phone.offer);
    expect((await fixture.post(sixth.packet("pair", pairBody(sixth)))).status).toBe(400);
    expect(fixture.gateway.store.devices).toHaveLength(5);
  });

  it("SEC-03 holds the HTTP response until a human confirms the locally derived SAS and consumes denials", async () => {
    const offer = decodeOffer(fixture.gateway.startPairing().pairing!.pairingString!);
    const phone = new TestPhone(offer);
    let settled = false;
    const pending = fixture.post(phone.packet("pair", pairBody(phone))).then(result => { settled = true; return result; });
    await until(() => fixture.gateway.snapshot().pairing?.status === "pending");
    await setTimeout(25);
    expect(settled).toBe(false); expect(fixture.gateway.store.devices).toHaveLength(0);
    expect(fixture.gateway.snapshot().pairing?.sas).toBe(mobileSas(fixture.gateway.store.identity,
      phone.identity.encryptionPublicKey, phone.identity.signingPublicKey, offer.pairingCode));
    expect(fixture.gateway.confirm("wrong-device", true)).toBe(false);
    expect(fixture.gateway.confirm(phone.id, false)).toBe(true);
    expect((await pending).status).toBe(400); expect(fixture.gateway.store.devices).toHaveLength(0);
    expect((await fixture.post(phone.packet("pair", pairBody(phone), 1))).status).toBe(400);
    const registered = await fixture.pair(); expect(fixture.gateway.store.devices[0].id).toBe(registered.id);
  });

  it("SEC-04 rejects gateway or phone public-key substitution instead of trusting the network", async () => {
    const offer = decodeOffer(fixture.gateway.startPairing().pairing!.pairingString!);
    const replacement = generateMobileIdentity();
    const wrongPin = new TestPhone({ ...offer, gatewayEncryptionKey: replacement.encryptionPublicKey, gatewaySigningKey: replacement.signingPublicKey });
    expect((await fixture.post(wrongPin.packet("pair", pairBody(wrongPin)))).status).toBe(400);
    const phone = new TestPhone(offer), packet = phone.packet("pair", pairBody(phone));
    expect((await fixture.post({ ...packet, phoneSigningKey: replacement.signingPublicKey })).status).toBe(400);
    expect(fixture.gateway.store.devices).toHaveLength(0);
  });

  it("SEC-13 locks a pairing code on its third malformed attempt and never revives it", async () => {
    const offer = decodeOffer(fixture.gateway.startPairing().pairing!.pairingString!);
    for (let index = 0; index < 3; index++) expect((await fixture.post({ v: 1 })).text).toBe('{"error":"rejected"}');
    expect(fixture.gateway.snapshot().pairing?.status).toBe("locked");
    const phone = new TestPhone(offer);
    expect((await fixture.post(phone.packet("pair", pairBody(phone)))).status).toBe(400);
    expect(fixture.gateway.store.devices).toHaveLength(0);
  });

  it("SEC-10 revokes a phone immediately and keeps registry, keys and audit storage private", async () => {
    const phone = await fixture.pair();
    const file = join(fixture.directory, "mobile", "state.json");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(join(fixture.directory, "mobile")).mode & 0o777).toBe(0o700);
    const snapshot = JSON.stringify(fixture.gateway.snapshot());
    expect(snapshot).not.toContain("PrivateKey"); expect(snapshot).not.toContain("phoneEncryptionKey"); expect(snapshot).not.toContain("lastSeq");
    expect(readFileSync(file, "utf8")).toContain("encryptionPrivateKey");
    expect(fixture.gateway.store.remove(phone.id)).toBe(true);
    expect((await fixture.post(phone.packet("status"))).status).toBe(400);
  });
});
