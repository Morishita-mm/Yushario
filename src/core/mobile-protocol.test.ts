import { describe, expect, it } from "vitest";
import vectors from "../../docs/mobile-protocol-vectors.json";
import {
  MOBILE_OPERATIONS, isMobileOperation, mobileBase64url, mobileReplayAllowed, mobileText,
  parseMobilePacket, parseMobileRequest, parseMobileRequestBody,
} from "./mobile-protocol";
import { mobilePermissionHashInput, parseMobileResponse, parseMobileResponseBody } from "./mobile-display";
import { mobileAad, mobileNonce, mobileRequestSigningInput, mobileResponseSigningInput } from "./mobile-signing";

const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
const validRequest = vectors.request.signedEnvelope;
const parseRequest = (changes: Record<string, unknown>) => parseMobileRequest({ ...validRequest, ...changes });

describe("mobile wire validation", () => {
  it("has exactly the seventeen allowed operations and rejects unknown fields", () => {
    expect(MOBILE_OPERATIONS).toEqual(["pair", "status", "permissions", "decide", "reports", "push-token", "push-prefs", "unpair", "towns", "quests", "quest-create",
      "quest-options", "quest-draft", "quest-prepare", "quest-form", "quest-embark", "quest-depart"]);
    for (const operation of ["terminal", "exec", "permission-decision", "PAIR", "__proto__", null]) {
      expect(isMobileOperation(operation)).toBe(false);
      expect(parseMobileRequestBody(operation, {})).toBeUndefined();
    }
    expect(parseRequest({ extra: true })).toBeUndefined();
    expect(parseRequest({ body: { ...validRequest.body, command: "pwd" } })).toBeUndefined();
    for (const operation of ["status", "permissions", "reports", "unpair"]) {
      expect(parseMobileRequestBody(operation, {})).toEqual({ operation, body: {} });
      expect(parseMobileRequestBody(operation, { arbitrary: 1 })).toBeUndefined();
    }
  });

  it("validates every request body without coercion or truncation", () => {
    expect(parseMobileRequest(vectors.pairRequest.signedEnvelope)).toBeDefined();
    expect(parseMobileRequest({ ...vectors.pairRequest.signedEnvelope, seq: 2 })).toBeUndefined();
    expect(parseMobileRequest(validRequest)).toBeDefined();
    expect(parseRequest({ body: { ...validRequest.body, decision: "terminal" } })).toBeUndefined();
    expect(parseRequest({ body: { ...validRequest.body, contentHash: "bad" } })).toBeUndefined();
    expect(parseMobileRequestBody("pair", { ...vectors.pairRequest.signedEnvelope.body, name: "a\n" })).toBeUndefined();
    expect(parseMobileRequestBody("pair", { ...vectors.pairRequest.signedEnvelope.body, name: "a".repeat(81) })).toBeUndefined();
    expect(parseMobileRequestBody("push-token", { token: "ExponentPushToken[test]" })).toBeDefined();
    expect(parseMobileRequestBody("push-token", { token: null })).toBeDefined();
    for (const token of ["", "a b", "x".repeat(513), 1]) expect(parseMobileRequestBody("push-token", { token })).toBeUndefined();
    for (const changes of [{ v: 2 }, { seq: 0 }, { seq: 1.5 }, { seq: Number.MAX_SAFE_INTEGER + 1 },
      { timestamp: -1 }, { timestamp: "1700000000000" }, { signature: "bad" }, { deviceId: "bad" }]) {
      expect(parseRequest(changes)).toBeUndefined();
    }
  });

  it("accepts well-formed Unicode and only canonical unpadded base64url", () => {
    expect(mobileText("勇者😀\n", 5)).toBe(true);
    expect(mobileText("\ud800", 10)).toBe(false);
    expect(mobileText("\udc00", 10)).toBe(false);
    expect(mobileText("😀", 1)).toBe(false);
    expect(mobileBase64url("AA", 1)).toBe(true);
    for (const value of ["AB", "AAB", "AA=", "A", "+A", "AA\n"]) expect(mobileBase64url(value)).toBe(false);
    expect(mobileBase64url(vectors.deviceId, 32)).toBe(true);
    expect(mobileBase64url(vectors.deviceId, 16)).toBe(false);
  });

  it("validates packet bounds and the clear routing fields", () => {
    expect(parseMobilePacket(vectors.request.packet)).toEqual(vectors.request.packet);
    expect(parseMobilePacket(vectors.response.packet)).toBeDefined();
    for (const changes of [{ v: 0 }, { seq: 0 }, { ciphertext: "AA" }, { ciphertext: "A".repeat(699_052) },
      { phoneEncryptionKey: "bad" }, { phoneSigningKey: "bad" }, { operation: "exec" }]) {
      expect(parseMobilePacket({ ...vectors.request.packet, ...changes })).toBeUndefined();
    }
  });

  it("validates all response bodies and display limits", () => {
    for (const sample of [vectors.response, vectors.pairResponse]) expect(parseMobileResponse(sample.signedEnvelope)).toBeDefined();
    expect(parseMobileResponse({ ...vectors.pairResponse.signedEnvelope, seq: 2 })).toBeUndefined();
    const permission = vectors.permission.displayed;
    expect(parseMobileResponseBody("permissions", { permissions: [permission] })).toBeDefined();
    expect(parseMobileResponseBody("permissions", { permissions: [{ ...permission, content: "a".repeat(2001) }] })).toBeUndefined();
    expect(parseMobileResponseBody("permissions", { permissions: Array(17).fill(permission) })).toBeUndefined();
    expect(parseMobileResponseBody("permissions", { permissions: [{ ...permission, omitted: -1 }] })).toBeUndefined();
    const hero = { id: "a", name: "勇者", town: "町", townId: null, state: "idle", permissionPending: false, variant: 2 };
    expect(parseMobileResponseBody("status", { heroes: [hero] })).toBeDefined();
    expect(parseMobileResponseBody("status", { heroes: [{ ...hero, state: "other" }] })).toBeUndefined();
    const report = { id: "r", questId: "q", questTitle: "クエスト", title: "報告", success: null, at: 0, excerpt: "", text: null, townId: null };
    expect(parseMobileResponseBody("reports", { reports: [report], nextCursor: null })).toBeDefined();
    expect(parseMobileResponseBody("reports", { reports: [{ ...report, excerpt: "x".repeat(501) }], nextCursor: null })).toBeUndefined();
    expect(parseMobileResponseBody("reports", { reports: Array(51).fill(report), nextCursor: null })).toBeUndefined();
    expect(parseMobileResponseBody("push-token", { updated: true })).toBeDefined();
    expect(parseMobileResponseBody("unpair", { unpaired: true })).toBeDefined();
    expect(parseMobileResponseBody("decide", { decided: false })).toBeUndefined();
    expect(parseMobileResponse({ ...vectors.response.signedEnvelope, extra: true })).toBeUndefined();
  });
});

describe("mobile deterministic bytes", () => {
  it("matches both request and response signing, AAD and nonce vectors", () => {
    // vectors.quests also holds every work operation with nested arrays (options, draft, prepare, form, embark, depart).
    for (const [direction, samples] of [["request", [vectors.request, vectors.pairRequest, ...vectors.quests.map(sample => sample.request)]],
      ["response", [vectors.response, vectors.pairResponse, ...vectors.quests.map(sample => sample.response)]]] as const) {
      for (const sample of samples) {
        const envelope = direction === "request" ? parseMobileRequest(sample.signedEnvelope) : parseMobileResponse(sample.signedEnvelope);
        expect(envelope).toBeDefined();
        const bytes = direction === "request" ? mobileRequestSigningInput(parseMobileRequest(sample.signedEnvelope)!)
          : mobileResponseSigningInput(parseMobileResponse(sample.signedEnvelope)!);
        expect(hex(bytes)).toBe(sample.signingInputHex);
        expect(hex(mobileAad(direction, envelope!.deviceId, envelope!.seq, vectors.publicKeys))).toBe(sample.aadHex);
        expect(hex(mobileNonce(envelope!.seq))).toBe(sample.nonceHex);
      }
    }
    expect(hex(mobileNonce(Number.MAX_SAFE_INTEGER))).toBe("00000000001fffffffffffff");
    expect(() => mobileNonce(0)).toThrow(RangeError);
  });

  it("projects the remaining operation bodies to fixed nested arrays", () => {
    const header = { v: 1, deviceId: vectors.deviceId, seq: 2, timestamp: 1700000000000 };
    const hero = { id: "h", name: "勇者", town: "町", townId: "t", state: "idle", permissionPending: true, variant: 2 };
    const report = { id: "r", questId: "q", questTitle: "クエスト", title: "報告", success: null, at: 0, excerpt: "先頭", text: null, townId: "t" };
    const p = vectors.permission.displayed;
    const cases = [
      ["status", { heroes: [hero] }, [[["h", "勇者", "町", "idle", true, "t", 2]]]],
      ["permissions", { permissions: [p] }, [[[p.id, p.heroId, p.heroName, p.town, p.tool, p.summary, p.content, p.omitted, p.expiresAt, p.townId, [p.work.questId, p.work.title], p.change, p.contentHash]]]],
      ["reports", { reports: [report], nextCursor: null }, [[["r", "q", "クエスト", "報告", null, 0, "先頭", null, "t"]], null]],
      ["push-token", { updated: true }, [true]], ["unpair", { unpaired: true }, [true]],
    ] as const;
    for (const [operation, body, values] of cases) {
      const response = parseMobileResponse({ ...header, operation, body, signature: validRequest.signature })!;
      expect(mobileResponseSigningInput(response)).toEqual(new TextEncoder().encode(JSON.stringify([
        "yushario.response.v1", 1, header.deviceId, header.seq, header.timestamp, operation, values,
      ])));
    }
    for (const [operation, body, values] of [["status", {}, []], ["permissions", {}, []], ["reports", {}, []],
      ["unpair", {}, []], ["push-token", { token: null }, [null]]] as const) {
      const request = parseMobileRequest({ ...header, operation, body, signature: validRequest.signature })!;
      expect(mobileRequestSigningInput(request)).toEqual(new TextEncoder().encode(JSON.stringify([
        "yushario.request.v1", 1, header.deviceId, header.seq, header.timestamp, operation, values,
      ])));
    }
  });

  it("ignores object property order but binds all permission display fields", () => {
    const parsed = parseMobileRequest(validRequest)!;
    const reordered = parseMobileRequest({ ...validRequest,
      body: { decision: "allow", contentHash: validRequest.body.contentHash, permissionId: validRequest.body.permissionId } })!;
    expect(mobileRequestSigningInput(reordered)).toEqual(mobileRequestSigningInput(parsed));
    const display = vectors.permission.displayed;
    expect(hex(mobilePermissionHashInput(display))).toBe(vectors.permission.hashInputHex);
    for (const [key, value] of Object.entries(display)) {
      if (key === "contentHash" || key === "work" || key === "change") continue;
      const changed = { ...display, [key]: typeof value === "number" ? value + 1 : value + "x" };
      expect(mobilePermissionHashInput(changed)).not.toEqual(mobilePermissionHashInput(display));
    }
  });
});

describe("mobile replay guard", () => {
  it("requires strict monotonicity and includes exactly the +/-60s boundaries", () => {
    const now = 1700000000000;
    expect(mobileReplayAllowed(2, now - 60_000, 1, now)).toBe(true);
    expect(mobileReplayAllowed(2, now + 60_000, 1, now)).toBe(true);
    for (const [seq, ts, last] of [[1, now, 1], [0, now, 0], [2, now - 60_001, 1],
      [2, now + 60_001, 1], [NaN, now, 0], [2, Infinity, 1], [2, now, -1]]) {
      expect(mobileReplayAllowed(seq, ts, last, now)).toBe(false);
    }
  });
});
