import { createPrivateKey, createPublicKey, generateKeyPairSync, diffieHellman, createHash,
  hkdfSync, sign, verify, createCipheriv, createDecipheriv, timingSafeEqual } from "node:crypto";
import { parseMobileRequest, type MobilePacket, type MobileSignedRequest } from "../../core/mobile-protocol";
import type { MobileResponse } from "../../core/mobile-display";
import { mobileAad, mobileNonce, mobileRequestSigningInput, mobileResponseSigningInput, type MobilePublicKeys } from "../../core/mobile-signing";
import { mobileSasDigits } from "../../core/mobile-pairing";

export type MobileIdentity = {
  encryptionPrivateKey: string; signingPrivateKey: string; encryptionPublicKey: string; signingPublicKey: string;
};
const raw = (value: string) => Buffer.from(value, "base64url");
export const mobileHash = (bytes: Uint8Array): Buffer => createHash("sha256").update(bytes).digest();
const privateKey = (value: string) => createPrivateKey({ key: raw(value), format: "der", type: "pkcs8" });
export function mobilePublicKey(value: string, type: "x25519" | "ed25519") {
  const prefix = type === "x25519" ? "302a300506032b656e032100" : "302a300506032b6570032100";
  return createPublicKey({ key: Buffer.concat([Buffer.from(prefix, "hex"), raw(value)]), format: "der", type: "spki" });
}
function publicFromPrivate(value: string): string {
  return createPublicKey(privateKey(value)).export({ format: "der", type: "spki" }).subarray(-32).toString("base64url");
}
export function mobileIdentity(encryptionPrivateKey: string, signingPrivateKey: string): MobileIdentity {
  if (privateKey(encryptionPrivateKey).asymmetricKeyType !== "x25519" || privateKey(signingPrivateKey).asymmetricKeyType !== "ed25519") throw Error("Invalid mobile keys");
  return { encryptionPrivateKey, signingPrivateKey, encryptionPublicKey: publicFromPrivate(encryptionPrivateKey), signingPublicKey: publicFromPrivate(signingPrivateKey) };
}
export function generateMobileIdentity(): MobileIdentity {
  const x = generateKeyPairSync("x25519"), ed = generateKeyPairSync("ed25519");
  return mobileIdentity(x.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64url"),
    ed.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64url"));
}
export function mobileIdentityFromSeeds(xHex: string, edHex: string): MobileIdentity {
  return mobileIdentity(Buffer.from(`302e020100300506032b656e04220420${xHex}`, "hex").toString("base64url"),
    Buffer.from(`302e020100300506032b657004220420${edHex}`, "hex").toString("base64url"));
}
export function mobileKeys(gateway: MobileIdentity, phoneX: string, phoneEd: string): MobilePublicKeys {
  return { gatewayEncryptionKey: gateway.encryptionPublicKey, gatewaySigningKey: gateway.signingPublicKey,
    phoneEncryptionKey: phoneX, phoneSigningKey: phoneEd };
}
function keyBytes(keys: MobilePublicKeys): Buffer {
  return Buffer.concat([keys.gatewayEncryptionKey, keys.gatewaySigningKey, keys.phoneEncryptionKey, keys.phoneSigningKey].map(raw));
}
export function mobileDeviceId(phoneX: string, phoneEd: string, code: string): string {
  return mobileHash(Buffer.concat([Buffer.from("yushario.device.v1\0"), raw(phoneX), raw(phoneEd), raw(code)])).toString("base64url");
}
export function mobileSas(gateway: MobileIdentity, phoneX: string, phoneEd: string, code: string): string {
  return mobileSasDigits(mobileHash(Buffer.concat([Buffer.from("yushario.sas.v1\0"), keyBytes(mobileKeys(gateway, phoneX, phoneEd)), raw(code)])));
}
export function deriveMobileKeys(gateway: MobileIdentity, phoneX: string, phoneEd: string, deviceId: string) {
  const sharedSecret = diffieHellman({ privateKey: privateKey(gateway.encryptionPrivateKey), publicKey: mobilePublicKey(phoneX, "x25519") });
  if (sharedSecret.every(byte => byte === 0)) throw Error("Invalid mobile key");
  const salt = mobileHash(Buffer.concat([Buffer.from("yushario.hkdf.v1\0"), keyBytes(mobileKeys(gateway, phoneX, phoneEd)), raw(deviceId)]));
  return { sharedSecret, salt,
    requestKey: Buffer.from(hkdfSync("sha256", sharedSecret, salt, "yushario.mobile.v1/request", 32)),
    responseKey: Buffer.from(hkdfSync("sha256", sharedSecret, salt, "yushario.mobile.v1/response", 32)),
    pushKey: Buffer.from(hkdfSync("sha256", sharedSecret, salt, "yushario.mobile.v1/push", 32)) };
}
export function mobileEqual(a: string, b: string): boolean {
  const left = raw(a), right = raw(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function mobileSign(bytes: Uint8Array, key: string): string { return sign(null, bytes, privateKey(key)).toString("base64url"); }
export function mobileVerify(bytes: Uint8Array, signature: string, key: string): boolean {
  return verify(null, bytes, mobilePublicKey(key, "ed25519"), raw(signature));
}
export function mobileEncrypt(plaintext: Uint8Array, key: Uint8Array, nonce: Uint8Array, aad: Uint8Array): Buffer {
  const cipher = createCipheriv("chacha20-poly1305", key, nonce, { authTagLength: 16 });
  cipher.setAAD(aad, { plaintextLength: plaintext.length });
  return Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
}
export function mobileDecrypt(ciphertext: Uint8Array, key: Uint8Array, nonce: Uint8Array, aad: Uint8Array): Buffer {
  if (ciphertext.length < 16 || ciphertext.length > 524288) throw Error("Invalid mobile packet");
  const encrypted = ciphertext.subarray(0, -16), decipher = createDecipheriv("chacha20-poly1305", key, nonce, { authTagLength: 16 });
  decipher.setAAD(aad, { plaintextLength: encrypted.length });
  decipher.setAuthTag(ciphertext.subarray(-16));
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}
export function openMobileRequest(packet: MobilePacket, gateway: MobileIdentity): MobileSignedRequest {
  const keys = mobileKeys(gateway, packet.phoneEncryptionKey, packet.phoneSigningKey);
  const { requestKey } = deriveMobileKeys(gateway, packet.phoneEncryptionKey, packet.phoneSigningKey, packet.deviceId);
  const plaintext = mobileDecrypt(raw(packet.ciphertext), requestKey, mobileNonce(packet.seq), mobileAad("request", packet.deviceId, packet.seq, keys));
  const request = parseMobileRequest(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext)));
  if (!request || request.deviceId !== packet.deviceId || request.seq !== packet.seq
    || !mobileVerify(mobileRequestSigningInput(request), request.signature, packet.phoneSigningKey)) throw Error("Invalid mobile request");
  return request;
}
export function sealMobileResponse(response: MobileResponse, gateway: MobileIdentity, phoneX: string, phoneEd: string): MobilePacket {
  const keys = mobileKeys(gateway, phoneX, phoneEd), { responseKey } = deriveMobileKeys(gateway, phoneX, phoneEd, response.deviceId);
  const signed = { ...response, signature: mobileSign(mobileResponseSigningInput(response), gateway.signingPrivateKey) };
  const ciphertext = mobileEncrypt(Buffer.from(JSON.stringify(signed)), responseKey, mobileNonce(response.seq), mobileAad("response", response.deviceId, response.seq, keys));
  if (ciphertext.length > 524288) throw Error("Mobile response too large");
  return { v: 1, deviceId: response.deviceId, seq: response.seq, phoneEncryptionKey: phoneX, phoneSigningKey: phoneEd, ciphertext: ciphertext.toString("base64url") };
}
