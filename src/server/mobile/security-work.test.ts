import { afterEach, describe, expect, it } from "vitest";
import { form, launchBody, launches, launchOnMac, macHeroes, member, noPrivate, ok, options, pairPhone, prepare, questCount, received,
  rejected, requestId, setWork, settle, spawned, startRelay, stopAll, townIds, until } from "./security-work-fixture";

afterEach(stopAll);

describe("mobile work real relay, PTY, CLI process, crypto and SQLite", () => {
  it("A2 lists only safe opaque choices per town; Pi is never offered for a new launch", async () => {
    const relay = await startRelay(), phone = await pairPhone(relay), towns = await townIds(relay, phone);
    await launchOnMac(relay, "pi", relay.towns.git);
    const git = await options(relay, phone, towns.git);
    expect(git.allowWork).toBe(true); expect(git.heroes).toHaveLength(1);
    expect(Object.keys(git.heroes[0]).sort()).toEqual(["accessory", "active", "busy", "canTalk", "effort", "id", "model", "name", "permissionGate", "preset", "questId", "townId", "variant", "weapon"]);
    expect(git.heroes[0]).toMatchObject({ permissionGate: false, canTalk: true, busy: false, active: true, questId: null });
    expect(git.presets.map(item => item.name).join(" ")).not.toMatch(/\bpi\b/i);
    expect(git.presets.map(item => item.name)).toEqual(expect.arrayContaining([expect.stringMatching(/claude/i), expect.stringMatching(/codex/i)]));
    expect(git.bases.length).toBeGreaterThan(0);
    for (const value of [...git.presets, ...git.bases]) expect(["claude", "codex", "pi", relay.towns.git]).not.toContain(value.id);
    noPrivate(relay, git);
    expect((await options(relay, phone, towns.plain)).heroes).toEqual([]);
    for (const townId of ["unknown", relay.towns.git, `${towns.git} `]) await rejected(relay, phone, "quest-options", { townId });
    await rejected(relay, phone, "quest-options", { townId: towns.git, cwd: relay.towns.git });
    await setWork(relay, phone, false);
    expect((await options(relay, phone, towns.git)).allowWork).toBe(false);
  }, 30000);

  it("A2 opt-in off rejects every agent-moving request without effects; card-only work still works", async () => {
    const relay = await startRelay(), phone = await pairPhone(relay, "Off phone", false), towns = await townIds(relay, phone);
    const pi = await launchOnMac(relay, "pi", relay.towns.git);
    const value = await options(relay, phone, towns.git), heroId = value.heroes[0].id;
    expect(value.allowWork).toBe(false);
    await rejected(relay, phone, "quest-prepare", prepare(towns.git, { mode: "send", heroId, text: "TEST-SHOULD-NOT-ARRIVE" }));
    await rejected(relay, phone, "quest-prepare", prepare(towns.git, { mode: "send", launch: launchBody(value, /claude/i) }));
    const card = await ok(relay, phone, "quest-prepare", prepare(towns.git));
    expect(card.heroId).toBeNull(); expect(card.delivery).toBe("none");
    const questId = card.draft.questId;
    expect((await ok(relay, phone, "quest-form", form(questId, [member(heroId, "implement", true, "TEST-SHOULD-NOT-ARRIVE")]))).draft.members).toHaveLength(1);
    await rejected(relay, phone, "quest-embark", { requestId: requestId(), questId, launch: launchBody(value, /codex/i), role: "review", writer: false });
    await rejected(relay, phone, "quest-depart", { requestId: requestId(), questId });
    expect((await ok(relay, phone, "quest-draft", { questId })).draft.departure.state).toBe("not-started");
    await settle();
    expect(received(relay, pi)).toEqual([]); expect(launches(relay)).toHaveLength(1);
  }, 30000);

  it("A2 creates cards, assigns without sending, and sends once to an existing hero with no private paths in responses", async () => {
    const relay = await startRelay(), phone = await pairPhone(relay), towns = await townIds(relay, phone);
    const [{ launch: pi, heroId }] = await macHeroes(relay, phone, towns.git, ["pi"]);
    const only = await ok(relay, phone, "quest-prepare", prepare(towns.git, { text: "札だけ" }));
    expect(only).toMatchObject({ heroId: null, delivery: "none", draft: { text: "札だけ", members: [], departure: { state: "not-started", steps: [] } } });
    const assigned = await ok(relay, phone, "quest-prepare", prepare(towns.git, { text: "担当だけ", heroId }));
    expect(assigned).toMatchObject({ heroId, delivery: "none" });
    const party = await ok(relay, phone, "quest-prepare", prepare(towns.git, { mode: "party", text: "仲間を集める" }));
    expect(party).toMatchObject({ heroId: null, delivery: "none", draft: { members: [], departure: { state: "not-started" } } });
    await settle(); expect(received(relay, pi)).toEqual([]);
    const sent = await ok(relay, phone, "quest-prepare", prepare(towns.git, { mode: "send", heroId, text: "TEST 依頼\n二行目" }));
    expect(sent).toMatchObject({ heroId, delivery: "sent" });
    await until(() => received(relay, pi).length === 1);
    expect(received(relay, pi)).toEqual([{ paste: true, text: expect.stringContaining("TEST 依頼\n二行目") }]);
    for (const value of [only, assigned, party, sent, await ok(relay, phone, "quest-draft", { questId: sent.draft.questId })]) noPrivate(relay, value);
    await settle(); expect(received(relay, pi)).toHaveLength(1);
  }, 30000);

  it("A2 launches only Claude/Codex with forced approval flags; a new launch is assigned but waits for an explicit departure", async () => {
    const relay = await startRelay(), first = await pairPhone(relay), second = await pairPhone(relay, "Second phone");
    const towns = await townIds(relay, first), value = await options(relay, first, towns.git);
    const claude = await ok(relay, first, "quest-prepare", prepare(towns.git, { mode: "send", launch: launchBody(value, /claude/i), text: "TEST 新しい勇者" }));
    expect(typeof claude.heroId).toBe("string"); expect(claude.delivery).toBe("none"); noPrivate(relay, claude);
    const claudeLaunch = await spawned(relay, "claude", 1);
    await settle(); expect(received(relay, claudeLaunch)).toEqual([]); // Mac 「作って出陣させる」 creates and assigns only.
    const departed = await ok(relay, first, "quest-depart", { requestId: requestId(), questId: claude.draft.questId });
    expect(departed.draft.departure.state).toBe("complete");
    await until(() => received(relay, claudeLaunch).length === 1);
    expect(received(relay, claudeLaunch)[0].text).toContain("TEST 新しい勇者");
    const card = await ok(relay, second, "quest-prepare", prepare(towns.git, { mode: "party" }));
    const codex = await ok(relay, second, "quest-embark", { requestId: requestId(), questId: card.draft.questId,
      launch: launchBody(await options(relay, second, towns.git), /codex/i), role: "review", writer: false });
    expect(typeof codex.heroId).toBe("string"); noPrivate(relay, codex);
    const codexLaunch = await spawned(relay, "codex", 1);
    const pair = (argv: string[], flag: string, value: string) => argv.some((item, index) => item === flag && argv[index + 1] === value);
    expect(pair(claudeLaunch.argv, "--permission-mode", "default")).toBe(true);
    expect(pair(codexLaunch.argv, "--ask-for-approval", "untrusted")).toBe(true);
    expect(pair(codexLaunch.argv, "--sandbox", "workspace-write")).toBe(true);
    for (const item of [claudeLaunch, codexLaunch]) {
      expect(item.argv.join(" ")).not.toMatch(/dangerously|bypass|full-auto|yolo|danger-full-access|--permission-mode (?!default)/);
      expect(item.argv.filter(arg => arg === "--permission-mode" || arg === "--ask-for-approval" || arg === "--sandbox").length).toBeLessThanOrEqual(2);
      expect(item.cwd.startsWith(relay.towns.git)).toBe(true);
      expect(item).toMatchObject({ agentToken: true, serverToken: false });
    }
    await settle(); expect(received(relay, codexLaunch)).toEqual([]); // Embark joins the party; nothing is sent before departure.
    expect(launches(relay).filter(item => item.name === "pi")).toEqual([]);
  }, 30000);

  it("A2 obey departure sends the main request to the owner and each helper only its own instruction, once", async () => {
    const relay = await startRelay(), phone = await pairPhone(relay), towns = await townIds(relay, phone);
    const [one, two] = await macHeroes(relay, phone, towns.git, ["pi", "pi"]);
    const card = await ok(relay, phone, "quest-prepare", prepare(towns.git, { mode: "party", text: "TEST 本題" }));
    const questId = card.draft.questId;
    await rejected(relay, phone, "quest-form", form(questId, Array.from({ length: 17 }, (_, index) => member(`h${index}`, "research"))));
    await rejected(relay, phone, "quest-form", form(questId, [member(one.heroId, "implement", true), member(one.heroId, "review")]));
    for (const text of ["", " ", "x".repeat(8001)]) await rejected(relay, phone, "quest-form", form(questId, [member(one.heroId, "implement", true)], "obey", text));
    const formed = await ok(relay, phone, "quest-form", form(questId, [member(one.heroId, "implement", true, "TEST-A 無視される"), member(two.heroId, "review", false, "TEST-B 確認")]));
    expect(formed.draft).toMatchObject({ tactic: "obey", text: "TEST 本題", departure: { state: "not-started" } });
    await settle(); expect([received(relay, one.launch), received(relay, two.launch)]).toEqual([[], []]);
    const departed = await ok(relay, phone, "quest-depart", { requestId: requestId(), questId });
    expect(departed.draft.departure).toMatchObject({ state: "complete", steps: [{ heroId: one.heroId, kind: "request", state: "sent" }, { heroId: two.heroId, kind: "ask", state: "sent" }] });
    await until(() => received(relay, one.launch).length === 1 && received(relay, two.launch).length === 1);
    expect(received(relay, one.launch)[0].text).toContain("TEST 本題"); expect(received(relay, one.launch)[0].text).not.toMatch(/TEST-A|TEST-B/);
    expect(received(relay, two.launch)[0].text).toContain("TEST-B"); expect(received(relay, two.launch)[0].text).not.toContain("TEST-A");
    noPrivate(relay, departed);
    await rejected(relay, phone, "quest-form", form(questId, [member(two.heroId, "implement", true)]));
    await settle(); expect([received(relay, one.launch).length, received(relay, two.launch).length]).toEqual([1, 1]);
    expect(await questCount(relay)).toBe(1);
  }, 30000);
});
