// Real phone-side crypto and real HTTP helpers, used only by SEC tests.
import { createPrivateKey, diffieHellman, hkdfSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { mobileAad, mobileNonce, type MobilePublicKeys } from "../../core/mobile-signing";
import { mobileRequestBodyValues, parseMobileRequestBody, type MobilePacket } from "../../core/mobile-protocol";
import { parseMobileResponse } from "../../core/mobile-display";
import { parseMobilePushPacket, parseMobilePushEnvelope, mobilePushAad, mobilePushSigningInput, mobilePushFresh } from "../../core/mobile-push-content";
import { mobileResponseSigningInput } from "../../core/mobile-signing";
import type { MobilePairingOffer } from "../../core/mobile-pairing";
import { PermissionWaiter } from "../permissions";
import { MobileGateway } from "./gateway";
import { generateMobileIdentity, mobileDeviceId, mobileHash, mobileEncrypt, mobileDecrypt, mobilePublicKey, mobileSign,
  mobileVerify, type MobileIdentity } from "./crypto";

export class TestPhone {
  readonly id: string;
  readonly keys: MobilePublicKeys;
  readonly requestKey: Buffer;
  readonly responseKey: Buffer;
  readonly pushKey: Buffer;
  seq = 1;
  constructor(readonly offer: MobilePairingOffer, readonly identity: MobileIdentity = generateMobileIdentity()) {
    this.id = mobileDeviceId(identity.encryptionPublicKey, identity.signingPublicKey, offer.pairingCode);
    this.keys = { gatewayEncryptionKey: offer.gatewayEncryptionKey, gatewaySigningKey: offer.gatewaySigningKey,
      phoneEncryptionKey: identity.encryptionPublicKey, phoneSigningKey: identity.signingPublicKey };
    const shared = diffieHellman({ privateKey: createPrivateKey({ key: Buffer.from(identity.encryptionPrivateKey, "base64url"), format: "der", type: "pkcs8" }),
      publicKey: mobilePublicKey(offer.gatewayEncryptionKey, "x25519") });
    const salt = mobileHash(Buffer.concat([Buffer.from("yushario.hkdf.v1\0"), ...Object.values(this.keys).map(value => Buffer.from(value, "base64url")), Buffer.from(this.id, "base64url")]));
    this.requestKey = Buffer.from(hkdfSync("sha256", shared, salt, "yushario.mobile.v1/request", 32));
    this.responseKey = Buffer.from(hkdfSync("sha256", shared, salt, "yushario.mobile.v1/response", 32));
    this.pushKey = Buffer.from(hkdfSync("sha256", shared, salt, "yushario.mobile.v1/push", 32));
  }
  packet(operation: string, body: object = {}, seq = this.seq++, timestamp = Date.now(), signature?: string): MobilePacket {
    const request = parseMobileRequestBody(operation, body);
    const input = Buffer.from(JSON.stringify(["yushario.request.v1", 1, this.id, seq, timestamp, operation, request ? mobileRequestBodyValues(request) : []]));
    const signed = { v: 1, deviceId: this.id, seq, timestamp, operation, body,
      signature: signature ?? mobileSign(input, this.identity.signingPrivateKey) };
    return this.seal(signed, seq);
  }
  seal(value: object, seq: number): MobilePacket {
    return { v: 1, deviceId: this.id, seq, phoneEncryptionKey: this.identity.encryptionPublicKey, phoneSigningKey: this.identity.signingPublicKey,
      ciphertext: mobileEncrypt(Buffer.from(JSON.stringify(value)), this.requestKey, mobileNonce(seq), mobileAad("request", this.id, seq, this.keys)).toString("base64url") };
  }
  openPush(input: unknown, now = Date.now(), lastAccepted = 0) {
    const packet = parseMobilePushPacket(input);
    if (!packet || packet.deviceId !== this.id || packet.seq <= lastAccepted) throw Error("Invalid push packet");
    const plaintext = mobileDecrypt(Buffer.from(packet.ciphertext, "base64url"), this.pushKey, mobileNonce(packet.seq), mobilePushAad(packet, this.keys));
    const value = parseMobilePushEnvelope(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext)));
    if (!value || value.deviceId !== packet.deviceId || value.seq !== packet.seq || value.kind !== packet.kind
      || !mobileVerify(mobilePushSigningInput(value), value.signature, this.offer.gatewaySigningKey)
      || !mobilePushFresh(value, lastAccepted, now)) throw Error("Invalid push content");
    return value;
  }
  open(packet: MobilePacket) {
    const plaintext = mobileDecrypt(Buffer.from(packet.ciphertext, "base64url"), this.responseKey, mobileNonce(packet.seq), mobileAad("response", this.id, packet.seq, this.keys));
    const response = parseMobileResponse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext)));
    if (!response || response.deviceId !== this.id || response.seq !== packet.seq
      || !mobileVerify(mobileResponseSigningInput(response), response.signature, this.offer.gatewaySigningKey)) throw Error("Invalid response");
    return response;
  }
}
export function decodeOffer(pairingString: string): MobilePairingOffer {
  return JSON.parse(Buffer.from(pairingString.slice("yushario-pair:1:".length), "base64url").toString("utf8"));
}
export async function until(check: () => boolean): Promise<void> {
  const end = Date.now() + 3000;
  for (let count = 0; count < 600 && Date.now() <= end; count++) { if (check()) return; await setTimeout(5); }
  throw Error("Condition did not settle");
}
export class GatewayFixture {
  readonly directory = mkdtempSync(join(tmpdir(), "yushario-sec-"));
  readonly permissions = new PermissionWaiter();
  gateway = new MobileGateway(join(this.directory, "mobile"), this.permissions);
  origin = "";
  async listen(): Promise<this> { await this.gateway.listen("127.0.0.1", 0); this.origin = this.gateway.addresses[0]; return this; }
  async post(value: unknown, path = "/mobile/v1", headers: Record<string, string> = {}) {
    const response = await fetch(this.origin + path, { method: "POST", headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(value), signal: AbortSignal.timeout(5000) });
    return { status: response.status, text: await response.text(), headers: response.headers };
  }
  async pair(name = "Test phone"): Promise<TestPhone> {
    const offer = decodeOffer(this.gateway.startPairing().pairing!.pairingString!);
    const phone = new TestPhone(offer);
    const pending = this.post(phone.packet("pair", { pairingCode: offer.pairingCode, name, pushToken: null }));
    await until(() => this.gateway.snapshot().pairing?.status === "pending");
    if (!this.gateway.confirm(phone.id, true)) throw Error("Confirmation failed");
    const result = await pending;
    if (result.status !== 200 || phone.open(JSON.parse(result.text)).operation !== "pair") throw Error("Pairing failed");
    return phone;
  }
  async restart(): Promise<void> {
    await this.gateway.close(); this.gateway = new MobileGateway(join(this.directory, "mobile"), this.permissions); await this.listen();
  }
  async close(): Promise<void> { this.permissions.cancel(); await this.gateway.close(); rmSync(this.directory, { recursive: true, force: true }); }
}
