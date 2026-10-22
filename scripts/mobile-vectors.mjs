// PUBLIC TEST KEYS ONLY. Never use these deterministic keys outside tests.
// All cryptography uses node:crypto; filesystem access only writes the fixture.
import { createPrivateKey, createPublicKey, diffieHellman, createHash, hkdfSync,
  sign, verify, createCipheriv, createDecipheriv } from "node:crypto";
import { writeFileSync } from "node:fs";

const utf8 = value => Buffer.from(value, "utf8");
const json = value => utf8(JSON.stringify(value));
const hex = value => Buffer.from(value).toString("hex");
const b64 = value => Buffer.from(value).toString("base64url");
const hash = (...parts) => createHash("sha256").update(Buffer.concat(parts)).digest();
function key(type, start) {
  const seed = Buffer.from(Array.from({ length: 32 }, (_, i) => start + i));
  const prefix = type === "x25519" ? "302e020100300506032b656e04220420" : "302e020100300506032b657004220420";
  const privateKey = createPrivateKey({ key: Buffer.concat([Buffer.from(prefix, "hex"), seed]), format: "der", type: "pkcs8" });
  const publicKey = createPublicKey(privateKey);
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  return { privateKey, publicKey, raw, vector: { privateKeyHex: hex(seed), publicKeyHex: hex(raw), publicKeyBase64url: b64(raw) } };
}
const gatewayX = key("x25519", 0x00), gatewayEd = key("ed25519", 0x20);
const phoneX = key("x25519", 0x40), phoneEd = key("ed25519", 0x60);
const publicKeyBytes = Buffer.concat([gatewayX.raw, gatewayEd.raw, phoneX.raw, phoneEd.raw]);
const publicKeys = {
  gatewayEncryptionKey: b64(gatewayX.raw), gatewaySigningKey: b64(gatewayEd.raw),
  phoneEncryptionKey: b64(phoneX.raw), phoneSigningKey: b64(phoneEd.raw),
};
const sharedSecret = diffieHellman({ privateKey: phoneX.privateKey, publicKey: gatewayX.publicKey });
if (!sharedSecret.equals(diffieHellman({ privateKey: gatewayX.privateKey, publicKey: phoneX.publicKey }))) throw Error("X25519 mismatch");
const pairingCode = Buffer.from("808182838485868788898a8b8c8d8e8f", "hex");
const deviceIdInput = Buffer.concat([utf8("yushario.device.v1\0"), phoneX.raw, phoneEd.raw, pairingCode]);
const deviceIdBytes = hash(deviceIdInput);
const deviceId = b64(deviceIdBytes);
const saltInput = Buffer.concat([utf8("yushario.hkdf.v1\0"), publicKeyBytes, deviceIdBytes]);
const salt = hash(saltInput);
const requestInfo = "yushario.mobile.v1/request", responseInfo = "yushario.mobile.v1/response";
const requestKey = Buffer.from(hkdfSync("sha256", sharedSecret, salt, utf8(requestInfo), 32));
const responseKey = Buffer.from(hkdfSync("sha256", sharedSecret, salt, utf8(responseInfo), 32));
const sasInput = Buffer.concat([utf8("yushario.sas.v1\0"), publicKeyBytes, pairingCode]);
const sasHash = hash(sasInput);
const sas = String(sasHash.readUInt32BE(0) % 1_000_000).padStart(6, "0");
const permission = {
  id: "permission-1", heroId: "hero-1", heroName: "勇者", town: "テストの町", tool: "Bash",
  summary: "Bash: printf 'hello'", content: "printf 'hello'\n", omitted: 0, expiresAt: 1700000120000,
};
const permissionValues = Object.values(permission);
const permissionInput = json(["yushario.permission.v1", ...permissionValues]);
const permissionHash = hash(permissionInput);
permission.contentHash = b64(permissionHash);

function sample(direction, envelope, bodyValues) {
  const signingInput = json([`yushario.${direction}.v1`, envelope.v, envelope.deviceId,
    envelope.seq, envelope.timestamp, envelope.operation, bodyValues]);
  const signingKey = direction === "request" ? phoneEd : gatewayEd;
  const signature = sign(null, signingInput, signingKey.privateKey);
  if (!verify(null, signingInput, signingKey.publicKey, signature)) throw Error("Signature mismatch");
  const signedEnvelope = { ...envelope, signature: b64(signature) };
  const plaintext = json(signedEnvelope);
  const nonce = Buffer.alloc(12);
  nonce.writeBigUInt64BE(BigInt(envelope.seq), 4);
  const aad = json(["yushario.aead.v1", direction, 1, deviceId, envelope.seq, ...Object.values(publicKeys)]);
  const encryptionKey = direction === "request" ? requestKey : responseKey;
  const cipher = createCipheriv("chacha20-poly1305", encryptionKey, nonce, { authTagLength: 16 });
  cipher.setAAD(aad, { plaintextLength: plaintext.length });
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const ciphertext = Buffer.concat([encrypted, tag]);
  const decipher = createDecipheriv("chacha20-poly1305", encryptionKey, nonce, { authTagLength: 16 });
  decipher.setAAD(aad, { plaintextLength: plaintext.length });
  decipher.setAuthTag(tag);
  if (!Buffer.concat([decipher.update(encrypted), decipher.final()]).equals(plaintext)) throw Error("AEAD mismatch");
  const packet = { v: 1, deviceId, seq: envelope.seq,
    phoneEncryptionKey: publicKeys.phoneEncryptionKey, phoneSigningKey: publicKeys.phoneSigningKey, ciphertext: b64(ciphertext) };
  return { signedEnvelope, signingInputHex: hex(signingInput), signatureHex: hex(signature),
    nonceHex: hex(nonce), aadHex: hex(aad), plaintextHex: hex(plaintext),
    ciphertextHex: hex(ciphertext), tagHex: hex(tag), packet };
}
const header = { v: 1, deviceId, seq: 2, timestamp: 1700000000000 };
const request = { ...header, operation: "decide", body: { permissionId: permission.id, contentHash: permission.contentHash, decision: "allow" } };
const response = { ...header, timestamp: header.timestamp + 25, operation: "decide", body: { decided: true } };
const offer = { v: 1, addresses: ["http://192.0.2.1:8791", "http://100.64.0.1:8791"],
  gatewayEncryptionKey: publicKeys.gatewayEncryptionKey, gatewaySigningKey: publicKeys.gatewaySigningKey,
  pairingCode: b64(pairingCode), expiresAt: 1700000300000 };
const pairRequest = { ...header, seq: 1, operation: "pair", body: { pairingCode: b64(pairingCode), name: "Test phone", pushToken: null } };
const pairResponse = { ...header, seq: 1, timestamp: header.timestamp + 1000, operation: "pair", body: { registered: true } };
const vectors = {
  description: "Yushario mobile v1 PUBLIC TEST KEYS; raw X25519 private scalars / Ed25519 seeds; ciphertext includes the final 16-byte tag.",
  keys: { gatewayX25519: gatewayX.vector, gatewayEd25519: gatewayEd.vector, phoneX25519: phoneX.vector, phoneEd25519: phoneEd.vector },
  publicKeys, deviceIdInputHex: hex(deviceIdInput), deviceId,
  hkdf: { sharedSecretHex: hex(sharedSecret), saltInputHex: hex(saltInput), saltHex: hex(salt),
    requestInfo, responseInfo, requestKeyHex: hex(requestKey), responseKeyHex: hex(responseKey) },
  pairing: { offer, pairingString: `yushario-pair:1:${b64(json(offer))}`, codeHex: hex(pairingCode),
    sasInputHex: hex(sasInput), sasHashHex: hex(sasHash), sas },
  permission: { displayed: permission, hashInputHex: hex(permissionInput), hashHex: hex(permissionHash) },
  request: sample("request", request, [permission.id, permission.contentHash, "allow"]),
  response: sample("response", response, [true]),
  pairRequest: sample("request", pairRequest, [b64(pairingCode), "Test phone", null]),
  pairResponse: sample("response", pairResponse, [true]),
};
writeFileSync(new URL("../docs/mobile-protocol-vectors.json", import.meta.url), JSON.stringify(vectors, null, 2) + "\n");
