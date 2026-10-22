import { describe, expect, it } from "vitest";
import vectors from "../../docs/mobile-protocol-vectors.json";
import {
  MOBILE_PAIRING_TTL_MS, mobilePairingState, mobilePairingTransition,
  mobilePushPayload, mobileSasDigits, parseMobilePairingOffer,
} from "./mobile-pairing";

const now = 1700000000000;
const deviceId = vectors.deviceId;
const reserve = { type: "reserve", deviceId } as const;
const confirm = { type: "confirm" } as const;
const fail = { type: "fail" } as const;

describe("mobile pairing state", () => {
  it("registers only after explicit Mac confirmation and consumes the code", () => {
    const available = mobilePairingState(now);
    expect(available.expiresAt).toBe(now + MOBILE_PAIRING_TTL_MS);
    expect(mobilePairingTransition(available, confirm, now, 0).register).toBe(false);
    const pending = mobilePairingTransition(available, reserve, now + 1, 0);
    expect(pending.register).toBe(false);
    expect(pending.state).toMatchObject({ status: "pending", deviceId });
    expect(available.status).toBe("available"); // No mutation of caller-owned state.
    const accepted = mobilePairingTransition(pending.state, confirm, now + 2, 0);
    expect(accepted.register).toBe(true);
    expect(accepted.state.status).toBe("consumed");
    expect(mobilePairingTransition(accepted.state, confirm, now + 3, 1).register).toBe(false);
    expect(mobilePairingTransition(accepted.state, reserve, now + 3, 1).state.status).toBe("consumed");
  });

  it("locks on the third failure and cannot be reopened", () => {
    let state = mobilePairingState(now);
    for (let failures = 1; failures <= 3; failures++) {
      state = mobilePairingTransition(state, fail, now, 0).state;
      expect(state.failures).toBe(failures);
      expect(state.status).toBe(failures === 3 ? "locked" : "available");
    }
    expect(mobilePairingTransition(state, reserve, now, 0).state.status).toBe("locked");
    expect(mobilePairingTransition(state, fail, now, 0).state.failures).toBe(3);
  });

  it("expires both available and pending codes exactly at five minutes", () => {
    const state = mobilePairingState(now);
    expect(mobilePairingTransition(state, reserve, state.expiresAt - 1, 0).state.status).toBe("pending");
    expect(mobilePairingTransition(state, reserve, state.expiresAt, 0).state.status).toBe("expired");
    const pending = mobilePairingTransition(state, reserve, now, 0).state;
    const late = mobilePairingTransition(pending, confirm, state.expiresAt, 0);
    expect(late.register).toBe(false);
    expect(late.state.status).toBe("expired");
    expect(mobilePairingTransition(state, reserve, now - 1, 0).state).toEqual(state);
  });

  it("caps devices at five, checks again on confirmation, and consumes a denial", () => {
    const available = mobilePairingState(now);
    expect(mobilePairingTransition(available, reserve, now, 5).state.status).toBe("available");
    const pending = mobilePairingTransition(available, reserve, now, 4).state;
    expect(mobilePairingTransition(pending, confirm, now, 4).register).toBe(true);
    expect(mobilePairingTransition(pending, confirm, now, 5)).toMatchObject({ state: { status: "consumed" }, register: false });
    expect(mobilePairingTransition(pending, { type: "reject" }, now, 4)).toMatchObject({ state: { status: "consumed" }, register: false });
    expect(mobilePairingTransition(pending, fail, now, 4).state).toEqual(pending);
    expect(mobilePairingTransition(pending, { type: "reserve", deviceId: "other" }, now, 4).state).toEqual(pending);
  });
});

describe("mobile pairing offer and privacy", () => {
  it("accepts the shared offer and rejects expired, malformed and oversized offers", () => {
    const offer = vectors.pairing.offer;
    expect(parseMobilePairingOffer(offer, now)).toEqual(offer);
    for (const changes of [{ expiresAt: now }, { expiresAt: now + MOBILE_PAIRING_TTL_MS + 60_001 },
      { v: 2 }, { addresses: [] }, { addresses: Array(9).fill("http://192.0.2.1:8791") },
      { addresses: ["http://example.com:8791/path"] }, { addresses: ["http://example.com:65536"] },
      { gatewayEncryptionKey: "bad" }, { pairingCode: "bad" }, { extra: true }]) {
      expect(parseMobilePairingOffer({ ...offer, ...changes }, now)).toBeUndefined();
    }
    expect(parseMobilePairingOffer({ ...offer, addresses: ["http://[::1]:8791"] }, now)).toBeDefined();
  });

  it("formats the unsigned big-endian hash prefix as exactly six digits", () => {
    const hash = Uint8Array.from(vectors.pairing.sasHashHex.match(/../g)!.map(byte => parseInt(byte, 16)));
    expect(mobileSasDigits(hash)).toBe(vectors.pairing.sas);
    expect(mobileSasDigits(new Uint8Array(32))).toBe("000000");
    const allOnes = new Uint8Array(32).fill(255);
    expect(mobileSasDigits(allOnes)).toBe("967295");
    expect(() => mobileSasDigits(new Uint8Array(31))).toThrow(RangeError);
  });

  it("uses high priority and the agreed alerts channel without work content", () => {
    for (const kind of ["permission", "report", "error"] as const) {
      expect(mobilePushPayload(kind)).toEqual({ priority: "high", channelId: "alerts", title: "Yushario", body: "確認が必要です", data: { kind } });
    }
    expect(() => mobilePushPayload("command" as "permission")).toThrow(RangeError);
  });
});
