import { describe, expect, it } from "vitest";
import vectors from "../../docs/mobile-protocol-vectors.json";
import { parseMobileRequestBody, mobileRequestBodyValues, mobileText } from "./mobile-protocol";
import { parseMobileResponseBody, mobileResponseBodyValues } from "./mobile-display";
import { isMobilePushContent, isMobilePushPrefs, MOBILE_PUSH_DEFAULTS, mobilePushFresh, mobilePushSigningInput,
  mobilePushText, parseMobilePushEnvelope, parseMobilePushPacket, MOBILE_PUSH_PLAINTEXT_BYTES } from "./mobile-push-content";

const sample = parseMobilePushEnvelope(vectors.pushes[0].signedEnvelope)!;
describe("push content v1 and preference contract", () => {
  it("reads and atomically replaces exactly three switches and the content capability", () => {
    expect(parseMobileRequestBody("push-prefs", {})).toEqual({ operation: "push-prefs", body: {} });
    for (const contentVersion of [0, 1] as const) {
      const body = { permission: false, report: true, error: false, contentVersion };
      const request = parseMobileRequestBody("push-prefs", body)!;
      expect(mobileRequestBodyValues(request)).toEqual([false, true, false, contentVersion]);
      expect(mobileResponseBodyValues(parseMobileResponseBody("push-prefs", body)!)).toEqual([false, true, false, contentVersion]);
    }
    for (const body of [null, [], { permission: false }, { ...MOBILE_PUSH_DEFAULTS, report: "false" },
      { ...MOBILE_PUSH_DEFAULTS, contentVersion: 2 }, { ...MOBILE_PUSH_DEFAULTS, deviceId: "other" }]) {
      expect(isMobilePushPrefs(body)).toBe(false);
      expect(parseMobileRequestBody("push-prefs", body)).toBeUndefined();
      expect(parseMobileResponseBody("push-prefs", body)).toBeUndefined();
    }
    expect(parseMobileResponseBody("push-prefs", {})).toBeUndefined();
  });
  it("validates all fixed vectors and rejects malformed content and routing metadata", () => {
    for (const vector of vectors.pushes) {
      expect(parseMobilePushEnvelope(vector.signedEnvelope)).toBeDefined();
      expect(parseMobilePushPacket(vector.packet)).toBeDefined();
      expect(new TextEncoder().encode(JSON.stringify(vector.signedEnvelope)).length).toBeLessThanOrEqual(MOBILE_PUSH_PLAINTEXT_BYTES);
    }
    for (const delta of [{ v: 2 }, { kind: "exec" }, { seq: 0 }, { ciphertext: "bad!" }, { seq: 1.5 }, { extra: true }]) {
      expect(parseMobilePushPacket({ ...vectors.pushes[0].packet, ...delta })).toBeUndefined();
    }
    for (const delta of [{ heroName: "x".repeat(81) }, { town: "a\n" }, { summary: "\ud800" },
      { summary: "x\u202ey" }, { expiresAt: -1 }, { target: { type: "permission", id: "p", questId: "q" } },
      { target: { type: "hero", id: "h", questId: null } }, { target: { type: "permission", id: "a\n", questId: null } }]) {
      expect(parseMobilePushEnvelope({ ...sample, ...delta })).toBeUndefined();
    }
  });
  it("bounds freshness independently of HTTP sequence, with strict expiry and a future-clock allowance", () => {
    expect(mobilePushFresh(sample, 0, sample.timestamp)).toBe(true);
    expect(mobilePushFresh(sample, 0, sample.timestamp - 60000)).toBe(true);
    expect(mobilePushFresh(sample, 0, sample.timestamp - 60001)).toBe(false);
    expect(mobilePushFresh(sample, sample.seq, sample.timestamp)).toBe(false);
    expect(mobilePushFresh(sample, 0, sample.expiresAt - 1)).toBe(true);
    expect(mobilePushFresh(sample, 0, sample.expiresAt)).toBe(false);
    expect(mobilePushFresh({ ...sample, expiresAt: sample.timestamp + 120001 }, 0, sample.timestamp)).toBe(false);
    const report = parseMobilePushEnvelope(vectors.pushes[1].signedEnvelope)!;
    expect(mobilePushFresh(report, 0, report.timestamp + 3599999)).toBe(true);
    expect(mobilePushFresh(report, 0, report.timestamp + 3600000)).toBe(false);
  });
  it("accepts different kinds out of order using separate receive watermarks, without accepting same-kind replay", () => {
    const highest = { permission: 0, report: 0, error: 0 };
    for (const vector of vectors.pushes.slice(0, 3).reverse()) {
      const value = parseMobilePushEnvelope(vector.signedEnvelope)!;
      expect(mobilePushFresh(value, highest[value.kind], value.timestamp)).toBe(true);
      highest[value.kind] = value.seq;
      expect(mobilePushFresh(value, highest[value.kind], value.timestamp)).toBe(false);
    }
    expect(highest).toEqual({ permission: 1, report: 2, error: 3 });
  });
  it("shortens previews without splitting Unicode, interpreting controls, or carrying permission change bodies", () => {
    expect(mobilePushText("Bash: npm test", "確認")).toBe("Bash: npm test");
    expect(mobilePushText("Edit: src/app.ts", "確認")).toBe("Edit: src/app.ts");
    expect(mobilePushText("a\n\u0000\u202eb", "確認")).toBe("a   b");
    const text = mobilePushText("あ".repeat(78) + "😀" + "x".repeat(100), "確認");
    expect(text.endsWith("…")).toBe(true); expect(mobileText(text, 80)).toBe(true);
    expect(mobilePushText("\ud800", "勇者")).toBe("勇者");
  });
  it("binds display, expiry and target to the signature and stays bounded for worst-case valid text", () => {
    for (const delta of [{ heroName: "別名" }, { town: "別の町" }, { summary: "別の用件" }, { expiresAt: sample.expiresAt - 1 },
      { target: { type: "permission" as const, id: "different", questId: null } }]) {
      expect(mobilePushSigningInput({ ...sample, ...delta })).not.toEqual(mobilePushSigningInput(sample));
    }
    const longest = { ...sample, kind: "report" as const, heroName: "界".repeat(80), town: "町".repeat(80), summary: "文".repeat(80),
      seq: Number.MAX_SAFE_INTEGER, timestamp: Number.MAX_SAFE_INTEGER - 3600000, expiresAt: Number.MAX_SAFE_INTEGER,
      target: { type: "report" as const, id: "報".repeat(200), questId: "札".repeat(200) } };
    const { v: _, deviceId: _id, seq: _seq, timestamp: _time, signature: _sig, ...content } = longest;
    expect(isMobilePushContent(content)).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(longest)).length).toBeLessThanOrEqual(MOBILE_PUSH_PLAINTEXT_BYTES);
  });
});
