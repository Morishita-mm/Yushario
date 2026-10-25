import { afterEach, describe, expect, it } from "vitest";
import { form, macHeroes, member, noPrivate, ok, pairPhone, prepare, readyAgain, received, rejected, requestId, setWork, settle,
  startRelay, stopAll, townIds, until } from "./security-work-fixture";

afterEach(stopAll);
// "TEST-HOLD" in a request keeps that test CLI busy (no Stop) until the test sends it a real ready hook.
async function party(text: string, presets: ("pi" | "claude")[] = ["pi", "pi", "pi"], allowWork = true) {
  const relay = await startRelay(), phone = await pairPhone(relay, "Work phone", allowWork), towns = await townIds(relay, phone);
  const heroes = await macHeroes(relay, phone, towns.git, presets);
  const card = await ok(relay, phone, "quest-prepare", prepare(towns.git, { mode: "party", text }));
  return { relay, phone, towns, heroes, questId: card.draft.questId as string };
}
const depart = (questId: string) => ({ requestId: requestId(), questId });

describe("mobile work tactics through the Mac party/tactic engine (real relay process)", () => {
  it("A2 research sends each researcher the request plus only its own focus once, and the owner only after all researchers report", async () => {
    const { relay, phone, heroes: [owner, slow, fast], questId } = await party("TEST 本題");
    const formed = await ok(relay, phone, "quest-form", form(questId, [member(owner.heroId, "implement", true, "TEST-OWNER-ASK"),
      member(slow.heroId, "research", false, "TEST-R1 TEST-HOLD"), member(fast.heroId, "research", false, "TEST-R2")], "research"));
    expect(formed.draft.fits.find((fit: { tactic: string }) => fit.tactic === "research")).toMatchObject({ ok: true, gaps: [] });
    const departed = await ok(relay, phone, "quest-depart", depart(questId));
    expect(departed.draft.departure.steps).toEqual(expect.arrayContaining([
      { heroId: slow.heroId, kind: "research", state: "sent" }, { heroId: fast.heroId, kind: "research", state: "sent" }]));
    expect(departed.draft.departure.steps.some((step: { heroId: string }) => step.heroId === owner.heroId)).toBe(false);
    await until(() => received(relay, slow.launch).length === 1 && received(relay, fast.launch).length === 1);
    const [r1] = received(relay, slow.launch), [r2] = received(relay, fast.launch);
    for (const item of [r1, r2]) expect(item.text).toContain("TEST 本題");
    expect(r1.text).toContain("TEST-R1"); expect(r1.text).not.toContain("TEST-R2");
    expect(r2.text).toContain("TEST-R2"); expect(r2.text).not.toContain("TEST-R1");
    expect(r1.text + r2.text).not.toContain("TEST-OWNER-ASK");
    await settle(1000); expect(received(relay, owner.launch)).toEqual([]); // One researcher has not reported yet.
    readyAgain(slow.launch);
    await until(() => received(relay, owner.launch).length === 1);
    expect(received(relay, owner.launch)[0].text).toContain("TEST 本題");
    await settle(); expect([received(relay, owner.launch), received(relay, slow.launch), received(relay, fast.launch)].map(list => list.length)).toEqual([1, 1, 1]);
    noPrivate(relay, departed);
  }, 40000);

  it("A2 review defers the same-folder reviewer until the owner reports, then sends it once", async () => {
    const { relay, phone, heroes: [owner, reviewer], questId } = await party("TEST 本題 TEST-HOLD", ["pi", "pi"]);
    const formed = await ok(relay, phone, "quest-form", form(questId, [member(owner.heroId, "implement", true),
      member(reviewer.heroId, "review", false, "TEST-REVIEW 観点")], "review", "TEST 本題 TEST-HOLD"));
    expect(formed.draft.fits.find((fit: { tactic: string }) => fit.tactic === "review")).toMatchObject({ ok: true, inside: [reviewer.heroId] });
    const departed = await ok(relay, phone, "quest-depart", depart(questId));
    expect(departed.draft.departure).toMatchObject({ state: "complete", steps: [
      { heroId: owner.heroId, kind: "request", state: "sent" }, { heroId: reviewer.heroId, kind: "ask", state: "deferred" }] });
    await until(() => received(relay, owner.launch).length === 1);
    await settle(1000); expect(received(relay, reviewer.launch)).toEqual([]);
    readyAgain(owner.launch); // The owner's real report starts the review round.
    await until(() => received(relay, reviewer.launch).length === 1);
    await settle(); expect(received(relay, reviewer.launch)).toHaveLength(1); expect(received(relay, owner.launch)).toHaveLength(1);
  }, 40000);

  it("A2 delegate sends the main request to the commander, not the owner; unfit tactics are rejected before any change", async () => {
    const { relay, phone, heroes: [owner, commander, helper], questId } = await party("TEST 本題 TEST-HOLD");
    // Unfit forms currently consume the mutation budget (fit is checked after reservation), so use another device for them.
    const checker = await pairPhone(relay, "Checker phone");
    for (const [tactic, members] of [["review", [member(owner.heroId, "implement", true), member(helper.heroId, "research")]],
      ["research", [member(owner.heroId, "implement", true), member(helper.heroId, "review")]],
      ["delegate", [member(owner.heroId, "implement", true), member(helper.heroId, "research")]],
      ["research", [member(helper.heroId, "research")]]] as const) await rejected(relay, checker, "quest-form", form(questId, [...members], tactic));
    expect((await ok(relay, phone, "quest-draft", { questId })).draft).toMatchObject({ members: [], tactic: "obey" });
    await ok(relay, phone, "quest-form", form(questId, [member(owner.heroId, "implement", true), member(commander.heroId, "command"),
      member(helper.heroId, "research", false, "TEST-HELPER")], "delegate", "TEST 本題 TEST-HOLD"));
    const departed = await ok(relay, phone, "quest-depart", depart(questId));
    expect(departed.draft.departure.steps[0]).toEqual({ heroId: commander.heroId, kind: "request", state: "sent" });
    await until(() => received(relay, commander.launch).length === 1 && received(relay, helper.launch).length === 1);
    expect(received(relay, commander.launch)[0].text).toContain("TEST 本題");
    expect(received(relay, helper.launch)[0].text).toContain("TEST-HELPER"); expect(received(relay, helper.launch)[0].text).not.toContain("TEST 本題");
    await settle(1000); expect(received(relay, owner.launch)).toEqual([]); // The commander, still working, decides what the owner gets.
  }, 40000);

  it("A2 rejects invalid tactics, writers, roles, unknown and stopped members; a rejected form changes nothing", async () => {
    const { relay, phone, heroes: [a, b, c], questId } = await party("TEST 本題");
    for (const members of [[member(a.heroId, "implement", true), member(b.heroId, "implement", true)],
      [member(a.heroId, "review", true)], [member(a.heroId, "command"), member(b.heroId, "command")],
      [member(a.heroId, "test", true)], [member("unknown-hero", "implement", true)], [member(a.launch.terminal, "implement", true)]]) {
      await rejected(relay, phone, "quest-form", form(questId, members));
    }
    await rejected(relay, phone, "quest-form", form(questId, [member(a.heroId, "implement", true)], "parallel"));
    await rejected(relay, phone, "quest-form", { ...form(questId, [member(a.heroId, "implement", true)]), session: a.launch.terminal });
    process.kill(c.launch.pid, "SIGTERM"); // A real CLI exit: the hero is still listed but cannot join.
    await settle(1000);
    await rejected(relay, phone, "quest-form", form(questId, [member(a.heroId, "implement", true), member(c.heroId, "review")]));
    expect((await ok(relay, phone, "quest-draft", { questId })).draft).toMatchObject({ members: [], editable: true, draftLost: false });
    await ok(relay, phone, "quest-form", form(questId, [member(a.heroId, "implement", true), member(b.heroId, "review")]));
    await settle(); for (const hero of [a, b]) expect(received(relay, hero.launch)).toEqual([]);
  }, 40000);

  it("A2 a saved review form stays staged with opt-in off: a real owner Stop before departure arms nothing", async () => {
    const { relay, phone, heroes: [owner, reviewer], questId } = await party("TEST 本題", ["pi", "pi"], false);
    const saved = await ok(relay, phone, "quest-form", form(questId, [member(owner.heroId, "implement", true),
      member(reviewer.heroId, "review", false, "TEST-REVIEW")], "review"));
    expect(saved.draft).toMatchObject({ tactic: "review", departure: { state: "not-started" } });
    readyAgain(owner.launch); // A real Stop hook from the idle owner, without any departure.
    await settle(1500);
    expect([received(relay, owner.launch), received(relay, reviewer.launch)]).toEqual([[], []]);
    expect((await ok(relay, phone, "quest-draft", { questId })).draft).toMatchObject({ tactic: "review", departure: { state: "not-started" } });
    await rejected(relay, phone, "quest-depart", depart(questId));
  }, 40000);

  it("A2 a commander-bearing form needs opt-in and spends an agent-moving effect", async () => {
    const { relay, phone, heroes: [owner, commander, spare], questId } = await party("TEST 本題 TEST-HOLD", ["pi", "pi", "pi"], false);
    const delegate = form(questId, [member(owner.heroId, "implement", true), member(commander.heroId, "command")], "delegate", "TEST 本題 TEST-HOLD");
    await rejected(relay, phone, "quest-form", delegate);
    await setWork(relay, phone, true);
    await ok(relay, phone, "quest-form", { ...delegate, requestId: requestId() }); // Moving effect 1 of 2 this minute.
    expect((await ok(relay, phone, "quest-depart", depart(questId))).draft.departure.state).toBe("complete"); // 2 of 2.
    await until(() => received(relay, commander.launch).length === 1);
    await rejected(relay, phone, "quest-prepare", prepare((await townIds(relay, phone)).git, { mode: "send", heroId: spare.heroId, text: "TEST-THIRD" }));
    await settle(); expect(received(relay, spare.launch)).toEqual([]); expect(received(relay, owner.launch)).toEqual([]);
  }, 40000);

  it("A2 assigning or forming a busy hero requires opt-in and spends an activation slot without sending again", async () => {
    const { relay, phone, towns, heroes: [busy, idle], questId } = await party("TEST 本題", ["pi", "pi"]);
    await ok(relay, phone, "quest-prepare", prepare(towns.git, { mode: "send", heroId: busy.heroId, text: "TEST-HOLD 作業中" }));
    await until(() => received(relay, busy.launch).length === 1); await settle();
    await setWork(relay, phone, false);
    await rejected(relay, phone, "quest-form", form(questId, [member(busy.heroId, "implement", true)]));
    await rejected(relay, phone, "quest-form", form(questId, [member(idle.heroId, "implement", true), member(busy.heroId, "review")]));
    await rejected(relay, phone, "quest-prepare", prepare(towns.git, { heroId: busy.heroId }));
    expect((await ok(relay, phone, "quest-form", form(questId, [member(idle.heroId, "implement", true)]))).draft.members).toHaveLength(1);
    await setWork(relay, phone, true);
    expect((await ok(relay, phone, "quest-form", form(questId, [member(busy.heroId, "implement", true)]))).draft.members[0].heroId).toBe(busy.heroId);
    await rejected(relay, phone, "quest-prepare", prepare(towns.git, { mode: "send", heroId: idle.heroId }));
    await settle(); expect(received(relay, busy.launch)).toHaveLength(1); expect(received(relay, idle.launch)).toEqual([]);
  }, 40000);
});
