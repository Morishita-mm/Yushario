import { describe, expect, it } from "vitest";
import vectors from "../../../docs/mobile-protocol-vectors.json";
import { mobilePermissionHashInput, parseMobileResponse } from "../../core/mobile-display";
import { mobileAad, mobileNonce, mobileRequestSigningInput, mobileResponseSigningInput } from "../../core/mobile-signing";
import { parseMobileRequest } from "../../core/mobile-protocol";
import { deriveMobileKeys, mobileDeviceId, mobileHash, mobileIdentityFromSeeds, mobileSas, mobileSign,
  openMobileRequest, sealMobileResponse, mobileEncrypt } from "./crypto";
import { TestPhone } from "./test-client";
import { mobilePushAad, mobilePushSigningInput, parseMobilePushEnvelope, parseMobilePushPacket } from "../../core/mobile-push-content";

const gateway = mobileIdentityFromSeeds(vectors.keys.gatewayX25519.privateKeyHex, vectors.keys.gatewayEd25519.privateKeyHex);
const phoneIdentity = mobileIdentityFromSeeds(vectors.keys.phoneX25519.privateKeyHex, vectors.keys.phoneEd25519.privateKeyHex);
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

describe("mobile Node crypto shared vectors", () => {
  it("matches raw public keys, device ID, X25519, HKDF, SAS and permission hash", () => {
    expect(gateway.encryptionPublicKey).toBe(vectors.publicKeys.gatewayEncryptionKey);
    expect(gateway.signingPublicKey).toBe(vectors.publicKeys.gatewaySigningKey);
    expect(phoneIdentity.encryptionPublicKey).toBe(vectors.publicKeys.phoneEncryptionKey);
    expect(phoneIdentity.signingPublicKey).toBe(vectors.publicKeys.phoneSigningKey);
    const { phoneEncryptionKey: px, phoneSigningKey: ps } = vectors.publicKeys;
    expect(mobileDeviceId(px, ps, vectors.pairing.offer.pairingCode)).toBe(vectors.deviceId);
    const derived = deriveMobileKeys(gateway, px, ps, vectors.deviceId);
    expect(hex(derived.sharedSecret)).toBe(vectors.hkdf.sharedSecretHex);
    expect(hex(derived.salt)).toBe(vectors.hkdf.saltHex);
    expect(hex(derived.requestKey)).toBe(vectors.hkdf.requestKeyHex);
    expect(hex(derived.responseKey)).toBe(vectors.hkdf.responseKeyHex);
    expect(hex(derived.pushKey)).toBe(vectors.hkdf.pushKeyHex);
    expect(new Set([derived.pushKey, derived.requestKey, derived.responseKey].map(hex)).size).toBe(3);
    expect(mobileSas(gateway, px, ps, vectors.pairing.offer.pairingCode)).toBe(vectors.pairing.sas);
    expect(hex(mobileHash(mobilePermissionHashInput(vectors.permission.displayed)))).toBe(vectors.permission.hashHex);
    expect(hex(mobileHash(Buffer.from(vectors.pairing.sasInputHex, "hex")))).toBe(vectors.pairing.sasHashHex);
  });
  it("matches signing input, signatures, nonces, AAD and request/response ciphertext byte for byte", () => {
    const phone = new TestPhone({ ...vectors.pairing.offer, v: 1 }, phoneIdentity);
    for (const sample of [vectors.request, vectors.pairRequest, ...vectors.quests.map(sample => sample.request)]) {
      const request = parseMobileRequest(sample.signedEnvelope)!;
      expect(hex(mobileRequestSigningInput(request))).toBe(sample.signingInputHex);
      expect(hex(Buffer.from(mobileSign(mobileRequestSigningInput(request), phoneIdentity.signingPrivateKey), "base64url"))).toBe(sample.signatureHex);
      expect(hex(mobileNonce(request.seq))).toBe(sample.nonceHex);
      expect(hex(mobileAad("request", request.deviceId, request.seq, vectors.publicKeys))).toBe(sample.aadHex);
      const packet = phone.packet(request.operation, request.body, request.seq, request.timestamp);
      expect(packet).toEqual(sample.packet);
      expect(hex(Buffer.from(packet.ciphertext, "base64url"))).toBe(sample.ciphertextHex);
      expect(openMobileRequest(packet, gateway)).toEqual(sample.signedEnvelope);
    }
    for (const sample of [vectors.response, vectors.pairResponse, ...vectors.quests.map(sample => sample.response)]) {
      const response = parseMobileResponse(sample.signedEnvelope)!;
      expect(hex(mobileResponseSigningInput(response))).toBe(sample.signingInputHex);
      expect(hex(Buffer.from(mobileSign(mobileResponseSigningInput(response), gateway.signingPrivateKey), "base64url"))).toBe(sample.signatureHex);
      expect(hex(mobileAad("response", response.deviceId, response.seq, vectors.publicKeys))).toBe(sample.aadHex);
      const packet = sealMobileResponse(response, gateway, phoneIdentity.encryptionPublicKey, phoneIdentity.signingPublicKey);
      expect(packet).toEqual(sample.packet);
      expect(hex(Buffer.from(packet.ciphertext, "base64url"))).toBe(sample.ciphertextHex);
      expect(phone.open(packet)).toEqual(sample.signedEnvelope);
    }
  });
  it("matches the independent push HKDF, signatures, AAD, nonces and ciphertext vectors", () => {
    const phone = new TestPhone({ ...vectors.pairing.offer, v: 1 }, phoneIdentity);
    expect(hex(phone.pushKey)).toBe(vectors.hkdf.pushKeyHex);
    for (const sample of vectors.pushes) {
      const value = parseMobilePushEnvelope(sample.signedEnvelope)!, packet = parseMobilePushPacket(sample.packet)!;
      expect(hex(mobilePushSigningInput(value))).toBe(sample.signingInputHex);
      expect(hex(Buffer.from(mobileSign(mobilePushSigningInput(value), gateway.signingPrivateKey), "base64url"))).toBe(sample.signatureHex);
      expect(hex(mobilePushAad(packet, phone.keys))).toBe(sample.aadHex);
      expect(hex(mobileNonce(packet.seq))).toBe(sample.nonceHex);
      const plaintext = Buffer.from(JSON.stringify(value));
      expect(hex(plaintext)).toBe(sample.plaintextHex);
      expect(hex(mobileEncrypt(plaintext, phone.pushKey, mobileNonce(packet.seq), mobilePushAad(packet, phone.keys)))).toBe(sample.ciphertextHex);
      expect(phone.openPush(packet, value.timestamp)).toEqual(value);
      expect(() => phone.openPush(packet, value.expiresAt)).toThrow();
      expect(() => phone.openPush(packet, value.timestamp, packet.seq)).toThrow();
    }
  });
  it("rejects all-zero X25519 shared keys and modified tags", () => {
    expect(() => deriveMobileKeys(gateway, Buffer.alloc(32).toString("base64url"), phoneIdentity.signingPublicKey, vectors.deviceId)).toThrow();
    const bytes = Buffer.from(vectors.request.packet.ciphertext, "base64url"); bytes[bytes.length - 1] ^= 1;
    expect(() => openMobileRequest({ ...vectors.request.packet, v: 1, ciphertext: bytes.toString("base64url") }, gateway)).toThrow();
  });
});
