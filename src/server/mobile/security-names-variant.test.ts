import { afterEach, describe, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { Room } from "../../core/room";
import { heroVariant } from "../../core/mobile-hero";
import { mobileResponseSigningInput, mobileAad, mobileNonce } from "../../core/mobile-signing";
import { parseMobileResponse, type MobileSignedResponse } from "../../core/mobile-display";
import type { MobilePacket } from "../../core/mobile-protocol";
import type { TalkReport } from "../../core/turns";
import { mobileHash, mobileVerify, mobileEncrypt } from "./crypto";
import { MobileGateway } from "./gateway";
import { MobileQuests } from "./quests";
import { mobileHeroes } from "./data";
import { townView } from "../../core/town";
import { GatewayFixture, type TestPhone } from "./test-client";
import { startRelay, stopAll, pairPhone, screen, launchOnMac, ok, post, noPrivate, until } from "./security-work-fixture";

afterEach(async () => { await stopAll(); vi.unstubAllEnvs(); });

function rejectsVariant(packet: MobilePacket, phone: TestPhone): MobileSignedResponse {
  const original = phone.open(packet);
  if (original.operation !== "status" && original.operation !== "quest-options") throw Error("Not heroes");
  expect(original.body.heroes.length).toBeGreaterThan(0);
  const changed = parseMobileResponse({ ...original, body: { ...original.body, heroes: original.body.heroes.map((hero, i) =>
    i === 0 ? { ...hero, variant: (hero.variant + 1) % 5 } : hero) } })!;
  expect(changed).toBeDefined();
  const input = mobileResponseSigningInput(original), altered = mobileResponseSigningInput(changed);
  expect(altered).not.toEqual(input);
  expect(mobileHash(altered)).not.toEqual(mobileHash(input));
  expect(mobileVerify(input, original.signature, phone.offer.gatewaySigningKey)).toBe(true);
  expect(mobileVerify(altered, original.signature, phone.offer.gatewaySigningKey)).toBe(false);
  // Even a valid AEAD wrapper cannot hide a changed display field from signature verification.
  const ciphertext = mobileEncrypt(Buffer.from(JSON.stringify(changed)), phone.responseKey, mobileNonce(packet.seq),
    mobileAad("response", phone.id, packet.seq, phone.keys)).toString("base64url");
  expect(() => phone.open({ ...packet, ciphertext })).toThrow("Invalid response");
  return original;
}

describe("SEC-20/22/24 A6 names, report headings and signed hero colours", () => {
  it("uses shared names and internal colours in status/options, including overrides, departures and worktrees", async () => {
    const relay = await startRelay(), phone = await pairPhone(relay);
    const one = await launchOnMac(relay, "claude", relay.towns.git);
    const two = await launchOnMac(relay, "pi", relay.towns.git);
    const three = await launchOnMac(relay, "codex", relay.towns.git);
    const sessions = (await screen(relay, "/sessions")).json as { id: string; hero: string }[];
    const heroId = (terminal: string) => sessions.find(s => s.id === terminal)!.hero;
    const townId = (await ok(relay, phone, "towns", { cursor: null })).towns.find((t: any) => t.name === "git-town").id;
    const rawStatus = await post(relay, phone.packet("status")); expect(rawStatus.status).toBe(200);
    const status = rejectsVariant(JSON.parse(rawStatus.text), phone);
    if (status.operation !== "status") throw Error("Wrong operation");
    const names = new Map(status.body.heroes.map(h => [h.id, h.name]));
    expect(names.get(heroId(one.terminal))).toBe("Claude Code 1");
    expect(names.get(heroId(two.terminal))).toBe("pi 2");
    expect(names.get(heroId(three.terminal))).toBe("Codex 3");
    for (const h of status.body.heroes) expect(h.variant).toBe(heroVariant(h.id));
    const rawOptions = await post(relay, phone.packet("quest-options", { townId })); expect(rawOptions.status).toBe(200);
    const choices = rejectsVariant(JSON.parse(rawOptions.text), phone);
    if (choices.operation !== "quest-options") throw Error("Wrong operation");
    for (const h of choices.body.heroes) {
      const same = status.body.heroes.find(s => s.name === h.name)!;
      expect(same).toBeDefined(); expect(h.variant).toBe(same.variant); expect(h.id).not.toBe(same.id);
    }
    expect((await screen(relay, `/names/${heroId(two.terminal)}`, "PUT", { name: "git-town" })).status).toBe(200);
    expect((await ok(relay, phone, "status", {})).heroes.find((h: any) => h.id === heroId(two.terminal)).name).toBe("git-town");
    expect((await ok(relay, phone, "quest-options", { townId })).heroes.find((h: any) => h.preset === "pi").name).toBe("git-town");
    process.kill(one.pid, "SIGTERM");
    await until(async () => Boolean((await screen(relay, "/sessions")).json.find((s: any) => s.id === one.terminal)?.exited));
    await launchOnMac(relay, "claude", relay.towns.git);
    const tree = join(relay.root, "feature-tree");
    execFileSync("git", ["worktree", "add", "-q", "-b", "feature", tree], { cwd: relay.towns.git,
      env: { ...process.env, HOME: join(relay.root, "user"), GIT_CONFIG_GLOBAL: join(relay.root, "gitconfig"), GIT_CONFIG_NOSYSTEM: "1" } });
    await launchOnMac(relay, "pi", tree);
    const latest = await ok(relay, phone, "status", {}), options = await ok(relay, phone, "quest-options", { townId });
    expect(latest.heroes.map((h: any) => h.name)).toEqual(expect.arrayContaining(["Claude Code 4", "feature-tree"]));
    expect(latest.heroes.some((h: any) => h.id === heroId(one.terminal))).toBe(false);
    for (const name of ["Claude Code 4", "feature-tree"]) {
      const a = latest.heroes.find((h: any) => h.name === name), b = options.heroes.find((h: any) => h.name === name);
      expect(b).toBeDefined(); expect(b.variant).toBe(heroVariant(a.id));
    }
    for (const value of [status, choices, latest, options]) noPrivate(relay, value);
  }, 20000);

  it("colours a PTY not yet in the room from its session ID, not the public ID", async () => {
    const relay = await startRelay(), phone = await pairPhone(relay);
    // Replace only this isolated test CLI with one that has not emitted SessionStart.
    writeFileSync(join(relay.root, "bin", "pi"), `#!${process.execPath}\nsetInterval(() => {}, 60000);\n`, { mode: 0o700 });
    const session = await screen(relay, "/sessions", "POST", { preset: "pi", cwd: relay.towns.git });
    expect(session.status).toBe(201);
    expect((await ok(relay, phone, "status", {})).heroes).toHaveLength(0);
    const townId = (await ok(relay, phone, "towns", { cursor: null })).towns.find((t: any) => t.name === "git-town").id;
    const options = await ok(relay, phone, "quest-options", { townId });
    expect(options.heroes).toHaveLength(1);
    expect(options.heroes[0].id).not.toBe(session.json.id);
    expect(options.heroes[0].variant).toBe(heroVariant(session.json.id));
  }, 15000);

  it("derives all report headings from event.report over HTTP without changing success or stored PC titles", async () => {
    const fixture = new GatewayFixture();
    vi.resetModules(); vi.stubEnv("AGENT_CHARACTER_HOME", fixture.directory);
    const { QuestLedger } = await import("../quest-ledger");
    const ledger = new QuestLedger(() => undefined, () => true);
    try {
      await fixture.gateway.close();
      const room = new Room();
      const towns = [{ key: "/synthetic/folder/.git", path: "/synthetic/another-worktree", name: "表示名", firstSeenAt: 1, lastActiveAt: 1, pinned: false }];
      room.apply({ agent: "external-1", name: "表示名", project: towns[0].key, state: "idle" }, 1);
      room.apply({ agent: "external-2", name: "folder", project: towns[0].key, state: "idle" }, 1);
      room.apply({ agent: "external-3", name: "folder", project: towns[0].key, state: "idle" }, 1);
      const history = townView(room, 1).names;
      room.apply({ agent: "external-2", hook: "SessionEnd", state: "idle" }, 2);
      const views = new MobileQuests(ledger, () => towns, () => room);
      fixture.gateway = new MobileGateway(join(fixture.directory, "mobile"), fixture.permissions, views);
      fixture.gateway.heroes = mobileHeroes(room, {}, towns, views, history);
      await fixture.listen(); const phone = await fixture.pair();
      const status = await fixture.post(phone.packet("status")); expect(status.status).toBe(200);
      const heroes = phone.open(JSON.parse(status.text));
      if (heroes.operation !== "status") throw Error("Wrong operation");
      expect(heroes.body.heroes.map(h => [h.name, h.variant])).toEqual([
        ["勇者 1", heroVariant("external-1")], ["勇者 2", heroVariant("external-3")],
      ]);
      const quest = ledger.create("synthetic-town", "検査の札");
      const base: TalkReport = { kind: "talk", files: [], tests: { passed: 0, failed: 0 }, tools: 0, failures: 0, startedAt: 1, endedAt: 2 };
      const cases: [TalkReport | undefined, string, boolean | null][] = [
        [undefined, "返事が届いた", null], [base, "返事が届いた", null],
        [{ ...base, stopFailure: true }, "途中で止まった", false],
        [{ ...base, files: ["a"], tests: { passed: 0, failed: 1, last: "failed" } }, "ファイル 1件を変更・テスト失敗", false],
        [{ ...base, files: ["a", "b"] }, "ファイル 2件を変更・テスト未実行", null],
        [{ ...base, files: ["a"], tests: { passed: 1, failed: 1, last: "passed" } }, "ファイル 1件を変更・テスト成功", true],
        [{ ...base, kind: "scroll" }, "調査から戻った", null],
        [{ ...base, tests: { passed: 1, failed: 0, last: "passed" } }, "返事が届いた", true],
      ];
      cases.forEach(([report], i) => ledger.addEvent(quest.id, { kind: "report", at: i + 1, title: "PC の古い題", report,
        result: { cwd: "/synthetic/PRIVATE_RESULT" } }));
      for (const body of [{}, { questId: quest.id, cursor: null }]) {
        const response = await fixture.post(phone.packet("reports", body)); expect(response.status).toBe(200);
        const opened = phone.open(JSON.parse(response.text));
        if (opened.operation !== "reports") throw Error("Wrong operation");
        expect(opened.body.reports).toHaveLength(cases.length);
        for (const report of opened.body.reports) {
          expect(report.title).toBe(cases[report.at - 1][1]); expect(report.success).toBe(cases[report.at - 1][2]);
        }
      }
      expect(ledger.get(quest.id)!.events.every(e => e.title === "PC の古い題")).toBe(true);
    } finally { ledger.close(); await fixture.close(); }
  });
});
