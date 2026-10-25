import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { Room } from "../../core/room";
import { TOWN_THEMES, type TownRecord } from "../../core/town-ledger";
import { mobilePermissionHashInput } from "../../core/mobile-display";
import type { QuestLedger } from "../quest-ledger";
import { MobileGateway } from "./gateway";
import { MobileQuests } from "./quests";
import { mobileHeroes } from "./data";
import { mobileHash } from "./crypto";
import { GatewayFixture, type TestPhone } from "./test-client";
import { startRelay, stopAll, pairPhone, screen, launchOnMac, ok, prepare, requestId, rejected, noPrivate, until } from "./security-work-fixture";

let fixture: GatewayFixture, ledger: QuestLedger, room: Room, towns: TownRecord[], views: MobileQuests;
const privateKey = (n: number) => `/private/SEC-TOWN-${n}/repo/.git`;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function refresh() { fixture.gateway.heroes = mobileHeroes(room, {}, towns, views); }
async function restart() {
  await fixture.gateway.close();
  views = new MobileQuests(ledger, () => towns, () => room);
  fixture.gateway = new MobileGateway(join(fixture.directory, "mobile"), fixture.permissions, views);
  refresh(); await fixture.listen();
}
beforeEach(async () => {
  fixture = new GatewayFixture();
  vi.resetModules(); vi.stubEnv("AGENT_CHARACTER_HOME", fixture.directory);
  const { QuestLedger } = await import("../quest-ledger");
  ledger = new QuestLedger(() => undefined, () => true); room = new Room();
  towns = TOWN_THEMES.map((theme, i) => ({ key: privateKey(i), path: `/private/SEC-TOWN-${i}/repo`,
    name: "同じ町", parent: "同じ親", theme, firstSeenAt: 1, lastActiveAt: 1, pinned: false }));
  towns.push({ ...towns[0], key: privateKey(5), theme: undefined });
  towns.push({ ...towns[0], key: privateKey(6), theme: "unknown" as TownRecord["theme"] });
  await restart();
});
afterEach(async () => { await stopAll(); ledger.close(); await fixture.close(); vi.unstubAllEnvs(); });
async function send(phone: TestPhone, operation: string, body: object = {}) {
  refresh();
  const response = await fixture.post(phone.packet(operation, body));
  expect(response.status).toBe(200);
  return phone.open(JSON.parse(response.text)).body as Record<string, any>;
}
function addHero(n: number, project = privateKey(n)) {
  room.apply({ agent: `hero-${n}`, terminal: `terminal-${n}`, name: "勇者", project, state: "idle", hook: "SessionStart" }, Date.now());
}
function waitPermission(n: number) {
  return fixture.permissions.wait({ type: "permission", id: `permission-${n}`, terminal: `terminal-${n}`, agent: `hero-${n}`,
    name: "勇者", tool: "Bash", summary: "確認", content: "echo test", omitted: 0, expiresAt: Date.now() + 120000 }, true);
}

describe("SEC-24 town identity and appearance over real HTTP, crypto and SQLite", () => {
  it("joins identical labels by random IDs across heroes, permissions, quests and reports; binds permission town IDs", async () => {
    const phone = await fixture.pair(); addHero(0); addHero(1);
    const first = (await send(phone, "towns", { cursor: null })).towns;
    expect(new Set(first.map((town: any) => town.id)).size).toBe(7);
    expect(new Set(first.map((town: any) => town.name)).size).toBe(1);
    expect(first.every((town: any) => uuid.test(town.id))).toBe(true);
    expect(first.map((town: any) => town.theme).sort()).toEqual([...TOWN_THEMES, null, null].sort());
    const a = first.find((town: any) => town.theme === "village").id, b = first.find((town: any) => town.theme === "port").id;
    const qa = (await send(phone, "quest-create", { requestId: requestId(), townId: a, title: "A", purpose: "" })).quest;
    const qb = (await send(phone, "quest-create", { requestId: requestId(), townId: b, title: "B", purpose: "" })).quest;
    expect(ledger.summary(qa.id)!.town).toBe(privateKey(0)); expect(ledger.summary(qb.id)!.town).toBe(privateKey(1));
    for (const [quest, hero] of [[qa, "hero-0"], [qb, "hero-1"]] as const) {
      ledger.setWorktree(quest.id, { path: "/private/SECRET_CWD", branch: "SECRET_BRANCH" });
      ledger.addEvent(quest.id, { kind: "report", at: 10, hero, title: "報告", text: quest.title });
    }
    const held = waitPermission(0); void waitPermission(1);
    const heroes = (await send(phone, "status")).heroes;
    expect(heroes.map((hero: any) => hero.townId)).toEqual([a, b]);
    const permissions = (await send(phone, "permissions")).permissions;
    expect(permissions.map((permission: any) => permission.townId)).toEqual([a, b]);
    const quests = (await send(phone, "quests", { cursor: null })).quests;
    expect(quests.find((quest: any) => quest.id === qa.id).townId).toBe(a);
    expect(quests.find((quest: any) => quest.id === qb.id).townId).toBe(b);
    const reports = (await send(phone, "reports")).reports;
    expect(reports.find((report: any) => report.questId === qa.id).townId).toBe(a);
    expect(reports.find((report: any) => report.questId === qb.id).townId).toBe(b);
    const full = (await send(phone, "reports", { questId: qa.id, cursor: null })).reports;
    expect(full).toHaveLength(1); expect(full[0]).toMatchObject({ townId: a, text: "A" });
    // The report belongs to its quest, not the hero's later location.
    room.agents.get("hero-0")!.project = privateKey(1);
    expect((await send(phone, "reports", { questId: qa.id, cursor: null })).reports[0].townId).toBe(a);
    room.agents.get("hero-0")!.project = privateKey(0); refresh();
    const permission = permissions[0];
    const wrongHash = mobileHash(mobilePermissionHashInput({ ...permission, townId: b })).toString("base64url");
    expect((await fixture.post(phone.packet("decide", { permissionId: permission.id, contentHash: wrongHash, decision: "allow" }))).status).toBe(400);
    await send(phone, "decide", { permissionId: permission.id, contentHash: permission.contentHash, decision: "deny" });
    expect(await held).toBe("deny");
    expect((await send(phone, "towns", { cursor: null })).towns).toEqual(first);
    const wire = JSON.stringify([first, heroes, permissions, quests, reports, full]);
    for (const secret of ["/private/", ".git", "SECRET_", "cwd", "branch", "path"]) expect(wire).not.toContain(secret);
  });

  it("returns null for unknown/deleted membership, keeps identity across rename, and invalidates IDs on restart", async () => {
    const phone = await fixture.pair(); addHero(0); addHero(9);
    const original = (await send(phone, "towns", { cursor: null })).towns.find((town: any) => town.theme === "village").id;
    const quest = ledger.create(privateKey(0), "残る札");
    ledger.addEvent(quest.id, { kind: "report", at: 1, hero: "hero-0", title: "報告" });
    void waitPermission(0); void waitPermission(9);
    towns[0].name = "新しい名前";
    expect((await send(phone, "towns", { cursor: null })).towns.find((town: any) => town.name === "新しい名前").id).toBe(original);
    const removed = towns.shift()!;
    const heroes = (await send(phone, "status")).heroes;
    expect(heroes.every((hero: any) => hero.townId === null && hero.town === "町")).toBe(true);
    expect((await send(phone, "permissions")).permissions.every((p: any) => p.townId === null)).toBe(true);
    expect((await send(phone, "quests", { cursor: null })).quests[0].townId).toBeNull();
    expect((await send(phone, "reports")).reports[0].townId).toBeNull();
    towns.unshift(removed);
    const restored = (await send(phone, "towns", { cursor: null })).towns.find((town: any) => town.name === "新しい名前").id;
    expect(restored).not.toBe(original); expect(restored).toMatch(uuid);
    room.apply({ agent: "hero-0", hook: "SessionEnd", state: "idle" }, Date.now());
    expect((await send(phone, "permissions")).permissions.find((p: any) => p.heroId === "hero-0").townId).toBeNull();
    expect((await send(phone, "status")).heroes.some((hero: any) => hero.id === "hero-0")).toBe(false);
    await restart();
    const renewed = (await send(phone, "towns", { cursor: null })).towns.find((town: any) => town.name === "新しい名前").id;
    expect(renewed).not.toBe(restored); expect(renewed).toMatch(uuid);
    for (const townId of [original, restored, privateKey(0), "1", Buffer.from(privateKey(0)).toString("base64url")]) {
      // Exercise the actual town resolver through card creation.
      expect((await fixture.post(phone.packet("quest-create", { townId, requestId: `${Date.now()}.AAAAAAAAAAAAAAAAAAAAAA`, title: "不可", purpose: "" }))).status).toBe(400);
    }
    expect(ledger.list()).toHaveLength(1);
  });

  it("uses Mac ledger themes and the same IDs in live work choices/drafts, rejecting other-town heroes", async () => {
    const relay = await startRelay(), phone = await pairPhone(relay);
    const records = (await screen(relay, "/towns")).json;
    const one = records.find((town: TownRecord) => town.path === relay.towns.git);
    const two = records.find((town: TownRecord) => town.path === relay.towns.other);
    expect((await screen(relay, `/towns/${encodeURIComponent(one.key)}`, "PATCH", { theme: "snow" })).status).toBe(200);
    expect((await screen(relay, `/towns/${encodeURIComponent(two.key)}`, "PATCH", { theme: "volcano" })).status).toBe(200);
    const towns = (await ok(relay, phone, "towns", { cursor: null })).towns;
    const a = towns.find((town: any) => town.theme === "snow").id, b = towns.find((town: any) => town.theme === "volcano").id;
    const first = await launchOnMac(relay, "pi", relay.towns.git); await launchOnMac(relay, "pi", relay.towns.other);
    const status = await ok(relay, phone, "status", {});
    expect(new Set(status.heroes.map((hero: any) => hero.townId))).toEqual(new Set([a, b]));
    const choices = await ok(relay, phone, "quest-options", { townId: a });
    const other = await ok(relay, phone, "quest-options", { townId: b });
    expect(choices.heroes).toHaveLength(1); expect(other.heroes).toHaveLength(1);
    for (const row of [...choices.heroes, ...choices.bases]) expect(row.townId).toBe(a);
    for (const row of [...other.heroes, ...other.bases]) expect(row.townId).toBe(b);
    await rejected(relay, phone, "quest-prepare", prepare(a, { heroId: other.heroes[0].id }));
    const card = await ok(relay, phone, "quest-prepare", prepare(a));
    expect(card.draft.townId).toBe(a);
    expect((await ok(relay, phone, "quest-draft", { questId: card.draft.questId })).draft.townId).toBe(a);
    expect((await ok(relay, phone, "quests", { cursor: null })).quests[0].townId).toBe(a);
    process.kill(first.pid, "SIGTERM");
    await until(async () => (await screen(relay, "/sessions")).json.find((s: any) => s.id === first.terminal)?.exited !== undefined);
    const departed = await ok(relay, phone, "quest-options", { townId: a });
    expect(departed.heroes[0]).toMatchObject({ active: false, townId: null });
    for (const value of [towns, status, choices, other, card, departed]) noPrivate(relay, value);
  }, 20_000);
});
