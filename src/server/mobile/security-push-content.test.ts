import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { Room } from "../../core/room";
import { MOBILE_PUSH_DEFAULTS, mobilePushAad, type MobilePushPrefs } from "../../core/mobile-push-content";
import { mobileNonce } from "../../core/mobile-signing";
import type { Permission } from "../../core/permissions";
import type { QuestLedger } from "../quest-ledger";
import { MobileGateway } from "./gateway";
import { MobileQuests } from "./quests";
import { mobileDecrypt, mobileEncrypt } from "./crypto";
import { GatewayFixture, TestPhone, until } from "./test-client";

let fixture: GatewayFixture, expo: Server, ledger: QuestLedger;
let sent: Record<string, any>[], ticketError: boolean;
const privatePath = "/synthetic/PRIVATE_PATH/project";
const hero = { id: "PRIVATE_HERO_ID", name: "PRIVATE_HERO_NAME", town: "PRIVATE_TOWN_NAME", townId: null, variant: 2 as const,
  state: "idle" as const, permissionPending: false };
const kinds = ["permission", "report", "error"] as const;
async function restart(): Promise<void> {
  await fixture.gateway.close();
  const towns = [{ key: privatePath, path: privatePath, name: hero.town, firstSeenAt: 1, lastActiveAt: 1, pinned: false }];
  fixture.gateway = new MobileGateway(join(fixture.directory, "mobile"), fixture.permissions, new MobileQuests(ledger, () => towns, () => new Room()));
  fixture.gateway.heroes = [{ ...hero }]; await fixture.listen();
}
beforeEach(async () => {
  sent = []; ticketError = false;
  expo = createServer(async (request, response) => {
    let text = ""; for await (const chunk of request) text += chunk;
    const body = JSON.parse(text);
    if (request.url?.endsWith("/send")) {
      expect(Buffer.byteLength(text)).toBeLessThanOrEqual(4096); sent.push(body);
      response.end(JSON.stringify({ data: ticketError ? { status: "error", details: { error: "MessageRateExceeded" } }
        : { status: "ok", id: `ticket-${sent.length}` } }));
    } else response.end(JSON.stringify({ data: Object.fromEntries(body.ids.map((id: string) => [id, { status: "ok" }])) }));
  });
  await new Promise<void>(resolve => expo.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(expo.address() as { port: number }).port}`, realFetch = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation((url, options) => String(url).startsWith("https://exp.host/")
    ? realFetch(origin + new URL(String(url)).pathname, options) : realFetch(url, options));
  fixture = new GatewayFixture(); vi.resetModules(); vi.stubEnv("AGENT_CHARACTER_HOME", fixture.directory);
  const module = await import("../quest-ledger"); ledger = new module.QuestLedger(() => undefined, () => false);
  await restart();
});
afterEach(async () => {
  ledger.close(); await fixture.close();
  await new Promise<void>(resolve => { expo.close(() => resolve()); expo.closeAllConnections(); });
  vi.restoreAllMocks(); vi.unstubAllEnvs();
});
async function send(phone: TestPhone, operation: string, body: object = {}) {
  const result = await fixture.post(phone.packet(operation, body)); expect(result.status).toBe(200);
  return phone.open(JSON.parse(result.text));
}
async function pair(encrypted: boolean, token = "ExponentPushToken[PUBLIC_TEST_TOKEN]") {
  const phone = await fixture.pair(); await send(phone, "push-token", { token });
  if (encrypted) await send(phone, "push-prefs", { ...MOBILE_PUSH_DEFAULTS, contentVersion: 1 });
  return phone;
}
async function marked(phone: TestPhone, kind: typeof kinds[number]) {
  await until(() => fixture.gateway.store.devices.find(d => d.id === phone.id)!.notifiedKinds.includes(kind));
}
function permission(): Permission {
  return { type: "permission", id: "PRIVATE_PERMISSION_ID", agent: hero.id, terminal: "test-terminal", tool: "Edit",
    summary: "unused", content: privatePath + "/app.ts", omitted: 0, expiresAt: Date.now() + 60500 };
}
function notifyAll(): void { for (const kind of kinds) fixture.gateway.notify(kind); }

describe("SEC-26: encrypted notification content and authenticated preferences over real HTTP", () => {
  it("sends private previews only as data-only ciphertext, and legacy phones receive fixed text", async () => {
    const phone = await pair(true), old = await pair(false, "ExponentPushToken[PUBLIC_OLD_TOKEN]");
    const at = Date.now(), quest = ledger.create(privatePath, "PRIVATE_QUEST_TITLE");
    ledger.addEvent(quest.id, { kind: "report", hero: hero.id, at, title: "PC title", report: { kind: "scroll", files: [privatePath],
      tests: { passed: 0, failed: 0 }, tools: 1, failures: 0, startedAt: at - 1000, endedAt: at } });
    const p = permission(); fixture.gateway.notifyPermission(p);
    fixture.gateway.notifyEvent({ agent: hero.id, state: "idle", hook: "Stop" }, at);
    fixture.gateway.notifyEvent({ agent: hero.id, state: "error", hook: "StopFailure" }, at);
    await marked(phone, "error"); await marked(old, "error"); await until(() => sent.length === 6);
    const encrypted = sent.filter(row => row.data.deviceId === phone.id), legacy = sent.filter(row => !row.data.deviceId);
    expect(encrypted).toHaveLength(3); expect(legacy).toHaveLength(3);
    for (const row of encrypted) {
      expect(Object.keys(row).sort()).toEqual(["_contentAvailable", "data", "priority", "to", "ttl"]);
      expect(Object.keys(row.data).sort()).toEqual(["ciphertext", "deviceId", "kind", "seq", "v"]);
      expect(JSON.stringify(row)).not.toContain("PRIVATE_"); expect(JSON.stringify(row)).not.toContain(privatePath);
      const value = phone.openPush(row.data);
      expect(value).toMatchObject({ heroName: hero.name, town: hero.town, kind: row.data.kind });
      if (value.kind === "permission") {
        expect(value.summary).toBe(`Edit: ${privatePath}/app.ts`); expect(value.expiresAt).toBe(p.expiresAt);
        expect(value.target).toEqual({ type: "permission", id: p.id, questId: null }); expect(row.ttl).toBeLessThanOrEqual(60);
      } else if (value.kind === "report") {
        expect(value.summary).toBe("ファイル 1件を変更・テスト未実行");
        expect(value.target).toMatchObject({ type: "report", questId: quest.id });
        const reports = await send(phone, "reports", { questId: quest.id, cursor: null });
        if (reports.operation !== "reports") throw Error("Wrong operation");
        expect(reports.body.reports[0].id).toBe(value.target!.id); expect(reports.body.reports[0].title).toBe(value.summary);
        expect(row.ttl).toBeLessThanOrEqual(3600);
      } else { expect(value.summary).toBe("止まりました"); expect(value.target).toEqual({ type: "hero", id: hero.id, questId: null }); }
    }
    expect(legacy.map(row => row.body).sort()).toEqual(["確認が必要です", "報告が届きました", "勇者が止まりました"].sort());
    for (const row of legacy) { expect(row.title).toBe("Yushario"); expect(Object.keys(row.data)).toEqual(["kind"]); }
    const log = readFileSync(join(fixture.directory, "mobile", "push-delivery.jsonl"), "utf8");
    for (const text of ["PRIVATE_", "ciphertext", "ExponentPushToken", "summary", "target"]) expect(log).not.toContain(text);
  });

  it("rejects wrong keys, AEAD edits, signed-content edits, replay and expiry", async () => {
    const phone = await pair(true), other = new TestPhone(phone.offer);
    fixture.gateway.notifyPermission(permission()); await marked(phone, "permission");
    const packet = sent[0].data, value = phone.openPush(packet);
    expect(() => mobileDecrypt(Buffer.from(packet.ciphertext, "base64url"), other.pushKey, mobileNonce(packet.seq), mobilePushAad(packet, other.keys))).toThrow();
    expect(() => mobileDecrypt(Buffer.from(packet.ciphertext, "base64url"), phone.responseKey, mobileNonce(packet.seq), mobilePushAad(packet, phone.keys))).toThrow();
    const bytes = Buffer.from(packet.ciphertext, "base64url"); bytes[bytes.length - 1] ^= 1;
    for (const change of [{ ciphertext: bytes.toString("base64url") }, { kind: "error" }, { seq: packet.seq + 1 }, { deviceId: other.id }]) {
      expect(() => phone.openPush({ ...packet, ...change })).toThrow();
    }
    const ciphertext = mobileEncrypt(Buffer.from(JSON.stringify({ ...value, summary: "forged" })), phone.pushKey,
      mobileNonce(packet.seq), mobilePushAad(packet, phone.keys)).toString("base64url");
    expect(() => phone.openPush({ ...packet, ciphertext })).toThrow();
    expect(() => phone.openPush(packet, value.timestamp, packet.seq)).toThrow();
    expect(() => phone.openPush(packet, value.expiresAt)).toThrow();
  });

  it("persists three independent switches for only the authenticated device, preserving old status and the explicit test exception", async () => {
    const phone = await pair(true);
    for (const enabled of kinds) {
      const prefs: MobilePushPrefs = { permission: enabled === "permission", report: enabled === "report", error: enabled === "error", contentVersion: 1 };
      expect((await send(phone, "push-prefs", prefs)).body).toEqual(prefs);
      const before = sent.length; notifyAll(); await marked(phone, enabled); await setTimeout(30);
      expect(sent.slice(before).map(row => row.data.kind)).toEqual([enabled]);
    }
    const off = { permission: false, report: false, error: false, contentVersion: 1 };
    await send(phone, "push-prefs", off); await restart();
    expect((await send(phone, "push-prefs")).body).toEqual(off);
    const status = await send(phone, "status"); expect(Object.keys(status.body)).toEqual(["heroes"]);
    const before = sent.length; notifyAll(); await setTimeout(30); expect(sent).toHaveLength(before);
    expect(fixture.gateway.testPush(phone.id)).toBe(true); await until(() => sent.length === before + 1);
    expect(phone.openPush(sent.at(-1)!.data)).toMatchObject({ summary: "テスト通知", target: null });
    expect(fixture.gateway.store.devices[0].notifiedKinds).toEqual([]);
    const other = await pair(false, "ExponentPushToken[PUBLIC_OTHER_TOKEN]");
    expect((await send(other, "push-prefs")).body).toEqual(MOBILE_PUSH_DEFAULTS);
    expect((await fixture.post(phone.packet("push-prefs", MOBILE_PUSH_DEFAULTS, phone.seq++, Date.now(), "A".repeat(86)))).status).toBe(400);
    expect((await send(phone, "push-prefs")).body).toEqual(off);
    for (const body of [{ ...off, deviceId: other.id }, { ...off, error: "false" }, { ...off, contentVersion: 2 }, { permission: true }]) {
      expect((await fixture.post(phone.packet("push-prefs", body))).status).toBe(400);
    }
    expect((await send(other, "push-prefs")).body).toEqual(MOBILE_PUSH_DEFAULTS);
  });

  it("durably reserves separate push sequences even on failed sends, restart, capability toggles and abandoned reservations", async () => {
    const phone = await pair(true); ticketError = true;
    fixture.gateway.notify("report"); await until(() => fixture.gateway.snapshot().pushResults[0]?.ticketStatus === "error");
    expect(fixture.gateway.store.devices[0]).toMatchObject({ pushSeq: 1, notifiedKinds: [] });
    ticketError = false; fixture.gateway.notify("report"); await marked(phone, "report");
    expect(sent.map(row => row.data.seq)).toEqual([1, 2]);
    await send(phone, "status"); await restart();
    fixture.gateway.store.reservePush(phone.id); // Crash window: saved number, no encryption or delivery.
    await restart(); fixture.gateway.notify("report"); await marked(phone, "report"); expect(sent.at(-1)!.data.seq).toBe(4);
    await send(phone, "push-prefs", MOBILE_PUSH_DEFAULTS); fixture.gateway.testPush(phone.id);
    await until(() => sent.length === 4); expect(sent.at(-1)!.data).toEqual({ kind: "permission" });
    await send(phone, "push-prefs", { ...MOBILE_PUSH_DEFAULTS, contentVersion: 1 }); fixture.gateway.testPush(phone.id);
    await until(() => sent.length === 5); expect(sent.at(-1)!.data.seq).toBe(5); expect(phone.openPush(sent.at(-1)!.data).seq).toBe(5);
    expect(() => fixture.gateway.store.put({ ...fixture.gateway.store.devices[0], pushSeq: 0 })).toThrow();
    fixture.gateway.store.put({ ...fixture.gateway.store.devices[0], pushSeq: Number.MAX_SAFE_INTEGER });
    fixture.gateway.testPush(phone.id); await setTimeout(30); expect(sent).toHaveLength(5);
    expect(fixture.gateway.snapshot().pushResults[0]?.errorCode).toBe("PushPreparationFailed");
  });

  it("bounds maximal Unicode previews plus the largest allowed token below 4 KiB", async () => {
    const phone = await pair(true, '"'.repeat(512)); // Worst-case JSON escaping, still an allowed synthetic token.
    fixture.gateway.heroes = [{ ...hero, name: "勇".repeat(200), town: "町".repeat(200) }];
    fixture.gateway.notifyPermission({ ...permission(), id: "許".repeat(200), tool: "具".repeat(200), content: "文😀\n".repeat(400) });
    await marked(phone, "permission");
    expect(Buffer.byteLength(JSON.stringify(sent[0]))).toBeLessThanOrEqual(4096);
    const value = phone.openPush(sent[0].data);
    for (const text of [value.heroName, value.town, value.summary]) expect(text.length).toBeLessThanOrEqual(80);
    expect(value.target!.id).toBe("許".repeat(200));
  });

  it("does not encrypt or send when durable reservation fails, and migrates only genuinely old records", async () => {
    const phone = await pair(true), file = join(fixture.directory, "mobile", "state.json"), saved = readFileSync(file);
    rmSync(file); mkdirSync(file); // Real rename failure, not a filesystem mock.
    fixture.gateway.testPush(phone.id); await setTimeout(30);
    expect(sent).toHaveLength(0); expect(fixture.gateway.store.devices[0].pushSeq).toBe(0);
    expect(fixture.gateway.snapshot().pushResults[0]?.errorCode).toBe("PushPreparationFailed");
    rmSync(file, { recursive: true }); writeFileSync(file, saved, { mode: 0o600 });
    fixture.gateway.testPush(phone.id); await until(() => sent.length === 1); expect(sent[0].data.seq).toBe(1);
    await fixture.gateway.close();
    const state = JSON.parse(readFileSync(file, "utf8")); delete state.devices[0].pushSeq;
    writeFileSync(file, JSON.stringify(state)); await expect(restart()).rejects.toThrow(/Invalid mobile state/);
    delete state.devices[0].pushPrefs; writeFileSync(file, JSON.stringify(state)); await restart();
    // The deleted fields now model a pre-A8 fixture, not a supported recovery operation for an A8 registry.
    expect((await send(phone, "push-prefs")).body).toEqual(MOBILE_PUSH_DEFAULTS);
    expect(fixture.gateway.store.devices[0].lastSeq).toBeGreaterThan(1);
    expect(readdirSync(join(fixture.directory, "mobile")).sort()).toEqual(["gateway.lock", "push-delivery.jsonl", "state.json"]);
  });
});
