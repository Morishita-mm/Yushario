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
  summary: "Bash: printf 'hello'", content: "printf 'hello'\n", omitted: 0, expiresAt: 1700000120000, townId: "town-opaque",
  work: { questId: "quest-1", title: "表示を直す😀" }, change: null,
};
function pv(p) {
  const c = p.change;
  const change = c === null ? null : c.kind === "write" ? [c.kind, c.text, c.omitted]
    : c.kind === "edit" ? [c.kind, c.edits.map(e => [e.before, e.after, e.replaceAll]), c.omitted, c.omittedEdits] : [c.kind];
  return [p.id, p.heroId, p.heroName, p.town, p.tool, p.summary, p.content, p.omitted, p.expiresAt, p.townId,
    p.work === null ? null : [p.work.questId, p.work.title], change];
}
const permissionValues = pv(permission);
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
const town = { id: "town-opaque", name: "町", theme: "snow" };
const quest = { id: "quest-1", title: "題😀", town: town.name, state: "open", updatedAt: header.timestamp, townId: town.id };
const qv = [quest.id, quest.title, quest.town, quest.state, quest.updatedAt, quest.townId];
const report = { id: "report-1", questId: quest.id, questTitle: quest.title, title: "報告", success: null, at: header.timestamp, excerpt: "先頭", text: "全文😀\n", townId: town.id };
const rv = [report.id, report.questId, report.questTitle, report.title, report.success, report.at, report.excerpt];
const creationId = `${header.timestamp}.${b64(pairingCode)}`;
const questCases = [
  ["towns", { cursor: null }, [null], { towns: [town], nextCursor: null }, [[[town.id, town.name, town.theme]], null]],
  ["quests", { cursor: "previous" }, ["previous"], { quests: [quest], nextCursor: quest.id }, [[qv], quest.id]],
  ["quest-create", { requestId: creationId, townId: town.id, title: quest.title, purpose: "目的" }, [creationId, town.id, quest.title, "目的"], { quest }, [qv]],
  ["reports", {}, [], { reports: [{ ...report, text: null }], nextCursor: null }, [[[...rv, null, report.townId]], null]],
  ["reports", { questId: quest.id, cursor: null }, [quest.id, null], { reports: [report], nextCursor: report.id }, [[[...rv, report.text, report.townId]], report.id]],
];
// Work operations: every nested object is written in its canonical member order.
const choice = { id: "gear-1", name: "盾" };
const preset = { id: "preset-1", name: "Claude", weapons: [choice], accessories: [] };
const workHero = { id: "hero-1", name: "勇者", preset: "Claude", weapon: "盾", accessory: null,
  busy: false, canTalk: true, active: true, questId: null, permissionGate: true, townId: town.id };
const launch = { baseId: "base-1", presetId: preset.id, weaponId: choice.id, accessoryId: null };
const lv = [launch.baseId, launch.presetId, launch.weaponId, launch.accessoryId];
const member = { heroId: workHero.id, role: "implement", writer: true, ask: "実装して\n" };
const mv = [member.heroId, member.role, member.writer, member.ask];
const draft = { questId: quest.id, text: "依頼😀", tactic: "review", members: [member],
  fits: [{ tactic: "review", ok: false, gaps: ["reviewer"], inside: [workHero.id], outside: [] }],
  editable: true, draftLost: false, departure: { state: "partial", steps: [{ heroId: workHero.id, kind: "request", state: "sent" }] }, townId: town.id };
const dv = [draft.questId, draft.text, draft.tactic, [mv], [["review", false, ["reviewer"], [workHero.id], []]],
  true, false, ["partial", [[workHero.id, "request", "sent"]]], draft.townId];
const workId = `${header.timestamp}.${b64(Buffer.alloc(16, 0x11))}`;
questCases.push(
  ["quest-options", { townId: town.id }, [town.id],
    { allowWork: true, heroes: [workHero], bases: [{ id: "base-1", name: "拠点", townId: town.id }], presets: [preset] },
    [true, [[workHero.id, workHero.name, "Claude", "盾", null, false, true, true, null, true, workHero.townId]], [["base-1", "拠点", town.id]],
      [[preset.id, preset.name, [[choice.id, choice.name]], []]]]],
  ["quest-draft", { questId: quest.id }, [quest.id], { draft }, [dv]],
  ["quest-prepare", { requestId: workId, townId: town.id, text: draft.text, mode: "send", heroId: null, launch },
    [workId, town.id, draft.text, "send", null, lv], { draft, heroId: "hero-2", delivery: "none" }, [dv, "hero-2", "none"]],
  ["quest-form", { requestId: workId, questId: quest.id, text: draft.text, members: [member], tactic: "review" },
    [workId, quest.id, draft.text, [mv], "review"], { draft }, [dv]],
  ["quest-embark", { requestId: workId, questId: quest.id, launch, role: "review", writer: false },
    [workId, quest.id, lv, "review", false], { draft, heroId: "hero-2" }, [dv, "hero-2"]],
  ["quest-depart", { requestId: workId, questId: quest.id }, [workId, quest.id], { draft }, [dv]],
);
const hero = { id: "hero-1", name: "勇者", town: town.name, state: "idle", permissionPending: true, townId: town.id };
const themes = ["village", "port", "snow", "desert", "volcano", null];
questCases.push(
  ["status", {}, [], { heroes: [hero, { ...hero, id: "hero-2", townId: null }] },
    [[[hero.id, hero.name, hero.town, hero.state, true, town.id], ["hero-2", hero.name, hero.town, hero.state, true, null]]]],
  ["permissions", {}, [], { permissions: [permission] }, [[[...permissionValues, permission.contentHash]]]],
  ["towns", { cursor: null }, [null], { towns: themes.map((theme, i) => ({ id: `town-${i}`, name: "同じ町", theme })), nextCursor: null },
    [themes.map((theme, i) => [`town-${i}`, "同じ町", theme]), null]],
);
const changes = [
  { tool: "Write", change: { kind: "write", text: "書く本文😀\n\\u0000\u0000", omitted: 0 } },
  { tool: "Edit", change: { kind: "edit", edits: [{ before: "old\n", after: "new\n", replaceAll: true }], omitted: 0, omittedEdits: 0 } },
  { tool: "MultiEdit", change: { kind: "edit", edits: [{ before: "a", after: "b", replaceAll: false },
    { before: "c", after: "d", replaceAll: true }], omitted: 7, omittedEdits: 1 } },
  { tool: "Write", change: { kind: "unavailable" } },
];
for (const [index, item] of changes.entries()) {
  const p = { ...permission, ...item, id: `change-${index}`, content: "example.ts", summary: `${item.tool}: example.ts`, work: index === 3 ? null : permission.work };
  p.contentHash = b64(hash(json(["yushario.permission.v1", ...pv(p)])));
  questCases.push(["permissions", {}, [], { permissions: [p] }, [[[...pv(p), p.contentHash]]]]);
}
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
  quests: questCases.map(([operation, body, values, responseBody, responseValues], index) => ({
    request: sample("request", { ...header, seq: index + 3, operation, body }, values),
    response: sample("response", { ...header, seq: index + 3, operation, body: responseBody }, responseValues),
  })),
};
writeFileSync(new URL("../docs/mobile-protocol-vectors.json", import.meta.url), JSON.stringify(vectors, null, 2) + "\n");
