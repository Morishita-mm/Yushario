import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { Room } from "../../core/room";
import type { TownRecord } from "../../core/town-ledger";
import type { QuestLedger } from "../quest-ledger";
import { MobileGateway } from "./gateway";
import { MobileQuests } from "./quests";
import { GatewayFixture, TestPhone, decodeOffer } from "./test-client";

let fixture: GatewayFixture, ledger: QuestLedger, room: Room, towns: TownRecord[], keepText: boolean;
const internalPath = "/private/SEC-ONLY/project/.git";
const requestId = (at = Date.now()) => `${at}.${randomBytes(16).toString("base64url")}`;
async function restartGateway() {
  await fixture.gateway.close();
  fixture.gateway = new MobileGateway(join(fixture.directory, "mobile"), fixture.permissions, new MobileQuests(ledger, () => towns, () => room));
  await fixture.listen();
}
beforeEach(async () => {
  fixture = new GatewayFixture();
  vi.resetModules(); vi.stubEnv("AGENT_CHARACTER_HOME", fixture.directory);
  const { QuestLedger } = await import("../quest-ledger");
  keepText = false; ledger = new QuestLedger(() => undefined, () => keepText); room = new Room();
  towns = [{ key: internalPath, path: "/private/SEC-ONLY/project", name: "公開の町", firstSeenAt: 1, lastActiveAt: 1, pinned: false }];
  await restartGateway();
});
afterEach(async () => { vi.restoreAllMocks(); ledger.close(); await fixture.close(); vi.unstubAllEnvs(); });
async function send(phone: TestPhone, operation: string, body: object = {}) {
  const response = await fixture.post(phone.packet(operation, body));
  expect(response.status, response.text).toBe(200);
  return phone.open(JSON.parse(response.text));
}
async function townId(phone: TestPhone): Promise<string> {
  const response = await send(phone, "towns", { cursor: null });
  if (response.operation !== "towns") throw Error("wrong response");
  return response.body.towns[0].id;
}
async function rejected(phone: TestPhone, operation: string, body: object) {
  const response = await fixture.post(phone.packet(operation, body));
  expect(response.status).toBe(400); expect(response.text).toBe('{"error":"rejected"}');
}

describe("mobile quests real HTTP, crypto, SQLite and files", () => {
  it("SEC-18 validates known opaque towns and the same quest limits without assigning, sending or starting agents", async () => {
    const phone = await fixture.pair(), id = await townId(phone);
    const body = { requestId: requestId(), townId: id, title: "  札を作る😀  ", purpose: "まだ送信しない" };
    for (const patch of [{ townId: internalPath }, { townId: "unknown" }, { title: " " }, { title: "a".repeat(201) },
      { purpose: "a".repeat(2001) }, { session: "terminal" }, { say: "execute" }, { state: "active" }]) {
      await rejected(phone, "quest-create", { ...body, ...patch });
    }
    const response = await send(phone, "quest-create", body);
    if (response.operation !== "quest-create") throw Error("wrong response");
    const quest = ledger.get(response.body.quest.id)!;
    expect(quest).toMatchObject({ town: internalPath, title: "札を作る😀", purpose: body.purpose, state: "open", events: [] });
    expect(quest.session).toBeNull(); expect(ledger.party(quest.id)).toEqual([]);
    expect(ledger.snapshot().bindings).toEqual([]); expect(room.agents.size).toBe(0);
    expect(response.body.quest).toEqual({ id: quest.id, title: quest.title, town: "公開の町", townId: id, state: "open", updatedAt: quest.updatedAt });
    for (const operation of ["say", "assign", "spawn", "party", "done", "adopt"]) await rejected(phone, operation, {});
  });

  it("SEC-19 reserves IDs before effects, rejects concurrent duplicates and persists across gateway restart and expiry", async () => {
    const now = Date.now(); vi.spyOn(Date, "now").mockReturnValue(now);
    const phone = await fixture.pair(), id = await townId(phone);
    const body = { requestId: requestId(), townId: id, title: "one", purpose: "private purpose" };
    const results = await Promise.all([fixture.post(phone.packet("quest-create", body)), fixture.post(phone.packet("quest-create", body))]);
    expect(results.map(r => r.status).sort()).toEqual([200, 400]); expect(ledger.list()).toHaveLength(1);
    await restartGateway();
    const newId = await townId(phone);
    expect(newId).not.toBe(id);
    await rejected(phone, "quest-create", { ...body, townId: newId, title: "changed" });
    const other = await fixture.pair("other");
    await rejected(other, "quest-create", { ...body, townId: newId });
    vi.spyOn(Date, "now").mockReturnValue(now + 600_000);
    await rejected(phone, "quest-create", { ...body, townId: newId });
    expect(ledger.list()).toHaveLength(1);
    const audit = join(fixture.directory, "mobile", "quest-creations.jsonl");
    expect(JSON.parse(readFileSync(audit, "utf8").trim())).toEqual({ deviceId: phone.id, questId: ledger.list()[0].id, time: now });
    expect(statSync(audit).mode & 0o777).toBe(0o600);
    const reservations = join(fixture.directory, "mobile", "quest-requests.json");
    expect(statSync(reservations).mode & 0o777).toBe(0o600);
    expect(readFileSync(reservations, "utf8")).not.toContain(body.purpose);
  });

  it("SEC-19 limits creations to five per rolling minute per device, including after restart", async () => {
    const now = Date.now(); vi.spyOn(Date, "now").mockReturnValue(now);
    const phone = await fixture.pair(), id = await townId(phone);
    for (let i = 0; i < 5; i++) await send(phone, "quest-create", { requestId: requestId(), townId: id, title: "札", purpose: "" });
    await restartGateway();
    const body = { requestId: requestId(), townId: await townId(phone), title: "六枚目", purpose: "" };
    await rejected(phone, "quest-create", body); expect(ledger.list()).toHaveLength(5);
    vi.spyOn(Date, "now").mockReturnValue(now + 60_000);
    await send(phone, "quest-create", body); expect(ledger.list()).toHaveLength(6);
  });

  it("SEC-19 fails closed on reservation/audit I/O failure and does not reuse a reserved ID", async () => {
    const phone = await fixture.pair(), id = await townId(phone);
    const reservations = join(fixture.directory, "mobile", "quest-requests.json"), audit = join(fixture.directory, "mobile", "quest-creations.jsonl");
    const body = { requestId: requestId(), townId: id, title: "札", purpose: "" };
    mkdirSync(reservations); await rejected(phone, "quest-create", body); expect(ledger.list()).toEqual([]);
    rmSync(reservations, { recursive: true }); mkdirSync(audit);
    await rejected(phone, "quest-create", body); expect(ledger.list()).toEqual([]);
    rmSync(audit, { recursive: true });
    await rejected(phone, "quest-create", body); expect(ledger.list()).toEqual([]);
    await send(phone, "quest-create", { ...body, requestId: requestId() }); expect(ledger.list()).toHaveLength(1);
  });

  it("SEC-18 keeps unknown devices and another device's ID/sequence out of the creation path", async () => {
    const phone = await fixture.pair(), id = await townId(phone), other = await fixture.pair("other");
    const body = { requestId: requestId(), townId: id, title: "札", purpose: "" };
    const unknown = new TestPhone(decodeOffer(fixture.gateway.startPairing().pairing!.pairingString!));
    await rejected(unknown, "quest-create", body);
    const packet = phone.packet("quest-create", body);
    expect((await fixture.post({ ...packet, deviceId: other.id, seq: 100 })).text).toBe('{"error":"rejected"}');
    expect(fixture.gateway.store.devices.find(d => d.id === other.id)!.lastSeq).toBe(1);
    expect(ledger.list()).toEqual([]);
    fixture.gateway.store.remove(phone.id); await rejected(phone, "quest-create", body);
  });

  it("SEC-20 pages named quests and chronological report bodies without private metadata or unrelated events", async () => {
    const phone = await fixture.pair(); keepText = true;
    const quest = ledger.create(internalPath, "クエストの題", "目的", 10);
    ledger.setWorktree(quest.id, { path: "/private/SECRET_CWD", branch: "SECRET_BRANCH" });
    ledger.addEvent(quest.id, { kind: "command", at: 1, title: "COMMAND_SECRET", text: "OUTPUT_SECRET" });
    ledger.addEvent(quest.id, { kind: "request", at: 2, title: "PERMISSION_SECRET", text: "REQUEST_SECRET" });
    for (let at = 10; at >= 1; at--) ledger.addEvent(quest.id, { kind: "report", at, title: "報告", text: "本文".repeat(4500), result: { cwd: "/private/SECRET_CWD", branch: "SECRET_BRANCH" } });
    const response = await send(phone, "reports", { questId: quest.id, cursor: null });
    if (response.operation !== "reports") throw Error("wrong response");
    expect(response.body.reports.map(r => r.at)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(response.body.reports[0]).toMatchObject({ questId: quest.id, questTitle: quest.title, text: "本文".repeat(4000), excerpt: "本文".repeat(250) });
    const next = await send(phone, "reports", { questId: quest.id, cursor: response.body.nextCursor });
    if (next.operation !== "reports") throw Error("wrong response");
    expect(next.body.reports.map(r => r.at)).toEqual([9, 10]); expect(next.body.nextCursor).toBeNull();
    const recent = await send(phone, "reports");
    if (recent.operation !== "reports") throw Error("wrong response");
    expect(recent.body.reports.map(r => r.at)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(recent.body.reports.every(r => r.text === null)).toBe(true);
    const list = await send(phone, "quests", { cursor: null }), choices = await send(phone, "towns", { cursor: null });
    const wire = JSON.stringify([response, next, recent, list, choices]);
    for (const secret of [internalPath, "/private/", "SECRET_", "COMMAND_SECRET", "OUTPUT_SECRET", "PERMISSION_SECRET", "REQUEST_SECRET", "worktreePath", "branch", "cwd"]) expect(wire).not.toContain(secret);
    await rejected(phone, "reports", { questId: "unknown", cursor: null });
    await rejected(phone, "reports", { questId: quest.id, cursor: "unknown" });
  });

  it("SEC-20 bounds pages and encoded full responses, and handles deleted or cross-quest cursors", async () => {
    const phone = await fixture.pair(); keepText = true;
    for (let i = 0; i < 101; i++) {
      towns.push({ ...towns[0], key: `/private/SEC-ONLY/${i}`, name: `町${i}` });
      ledger.create(internalPath, `札${i}`, "", i);
    }
    const first = await send(phone, "quests", { cursor: null });
    if (first.operation !== "quests") throw Error("wrong response");
    expect(first.body.quests).toHaveLength(100);
    expect(first.body.quests[0].title).toBe("札100");
    const second = await send(phone, "quests", { cursor: first.body.nextCursor });
    if (second.operation !== "quests") throw Error("wrong response");
    expect(second.body.quests.map(q => q.title)).toEqual(["札0"]); expect(second.body.nextCursor).toBeNull();
    const townPage = await send(phone, "towns", { cursor: null });
    if (townPage.operation !== "towns") throw Error("wrong response");
    expect(townPage.body.towns).toHaveLength(100);
    const townNext = await send(phone, "towns", { cursor: townPage.body.nextCursor });
    if (townNext.operation !== "towns") throw Error("wrong response");
    expect(townNext.body.towns).toHaveLength(2); expect(townNext.body.nextCursor).toBeNull();
    const quest = ledger.list()[0], other = ledger.list()[1];
    const foreign = ledger.addEvent(other.id, { kind: "report", at: 1, title: "別の報告", text: "OTHER_SECRET" });
    for (let i = 0; i < 8; i++) ledger.addEvent(quest.id, { kind: "report", at: 1, title: "報告", text: "\u0001".repeat(8000) });
    const raw = await fixture.post(phone.packet("reports", { questId: quest.id, cursor: null }));
    expect(raw.status).toBe(200); expect(Buffer.byteLength(raw.text)).toBeLessThan(1048576);
    const response = phone.open(JSON.parse(raw.text));
    if (response.operation !== "reports") throw Error("wrong response");
    expect(response.body.reports).toHaveLength(8); expect(response.body.reports[0].text).toHaveLength(8000);
    expect(response.body.reports.map(r => r.id)).toEqual(response.body.reports.map(r => r.id).sort());
    await rejected(phone, "reports", { questId: quest.id, cursor: `report-${foreign}` });
    ledger.delete(first.body.nextCursor!);
    await rejected(phone, "quests", { cursor: first.body.nextCursor });
    ledger.close();
    const { QuestLedger } = await import("../quest-ledger");
    ledger = new QuestLedger(() => undefined, () => keepText); room = new Room(); await restartGateway();
    const restored = await send(phone, "reports", { questId: quest.id, cursor: null });
    if (restored.operation !== "reports") throw Error("wrong response");
    expect(restored.body.reports[0].text).toHaveLength(8000);
  });

  it("SEC-20 keeps unsaved bodies only in memory, matches the exact hero and time, and returns null after restart", async () => {
    const phone = await fixture.pair(), quest = ledger.create(internalPath, "本文なしの札");
    ledger.addEvent(quest.id, { kind: "report", at: 10, hero: "hero", title: "報告", text: "not saved" });
    ledger.addEvent(quest.id, { kind: "report", at: 20, hero: "hero", title: "報告" });
    room.apply({ agent: "hero", state: "success", hook: "Stop", text: "メモリだけ😀" }, 10);
    room.apply({ agent: "other", state: "success", hook: "Stop", text: "OTHER_SECRET" }, 20);
    room.apply({ agent: "hero", state: "working", hook: "PostToolUse", text: "OUTPUT_SECRET" }, 20);
    const response = await send(phone, "reports", { questId: quest.id, cursor: null });
    if (response.operation !== "reports") throw Error("wrong response");
    expect(response.body.reports.map(r => r.text)).toEqual(["メモリだけ😀", null]);
    expect(ledger.get(quest.id)!.events.every(e => e.text === undefined)).toBe(true);
    room = new Room(); await restartGateway();
    const restarted = await send(phone, "reports", { questId: quest.id, cursor: null });
    if (restarted.operation !== "reports") throw Error("wrong response");
    expect(restarted.body.reports.every(r => r.text === null && r.excerpt === "")).toBe(true);
  });
});
