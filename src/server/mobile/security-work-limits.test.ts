import { afterEach, describe, expect, it } from "vitest";
import { ageReservations, form, interrupt, launchBody, launches, macHeroes, member, ok, options, pairPhone, post, prepare, questCount,
  readyAgain, received, rejected, requestId, restartRelay, screen, settle, spawned, startRelay, stopAll, townIds, until } from "./security-work-fixture";

afterEach(stopAll);
const claudes = (relay: Parameters<typeof launches>[0]) => launches(relay).filter(item => item.name === "claude");

describe("mobile work durable reservations, quotas and partial departure (real relay process)", () => {
  it("A2 reserves request IDs before effects: concurrent duplicates and replays after a relay restart are rejected", async () => {
    let relay = await startRelay();
    const phone = await pairPhone(relay), towns = await townIds(relay, phone);
    const [{ launch: pi, heroId }] = await macHeroes(relay, phone, towns.git, ["pi"]);
    const body = prepare(towns.git, { mode: "send", heroId, text: "TEST 一度だけ" });
    const results = await Promise.all([post(relay, phone.packet("quest-prepare", body)), post(relay, phone.packet("quest-prepare", body))]);
    expect(results.map(result => result.status).sort()).toEqual([200, 400]);
    await until(() => received(relay, pi).length === 1); await settle();
    expect(received(relay, pi)).toHaveLength(1); expect(await questCount(relay)).toBe(1);
    const card = prepare(towns.git);
    await ok(relay, phone, "quest-prepare", card);
    relay = await restartRelay(relay);
    const after = await townIds(relay, phone);
    // Same request ID with fresh opaque town IDs, a different operation, or another device: still consumed.
    await rejected(relay, phone, "quest-prepare", { ...card, townId: after.git });
    await rejected(relay, phone, "quest-prepare", { ...body, townId: after.git, mode: "only", heroId: null });
    const other = await pairPhone(relay, "Other phone");
    await rejected(relay, other, "quest-prepare", { ...card, townId: after.git });
    expect(await questCount(relay)).toBe(2);
    expect((await ok(relay, phone, "quest-prepare", prepare(after.git))).draft.questId).toEqual(expect.any(String));
  }, 40000);

  it("A2 limits agent-moving effects to two per minute per device, sharing the budget with spawns", async () => {
    const relay = await startRelay(), phone = await pairPhone(relay), towns = await townIds(relay, phone);
    const [{ launch: pi, heroId }] = await macHeroes(relay, phone, towns.git, ["pi"]);
    for (const text of ["TEST-1", "TEST-2"]) await ok(relay, phone, "quest-prepare", prepare(towns.git, { mode: "send", heroId, text }));
    await rejected(relay, phone, "quest-prepare", prepare(towns.git, { mode: "send", heroId, text: "TEST-3" }));
    await rejected(relay, phone, "quest-prepare", prepare(towns.git, { mode: "send", launch: launchBody(await options(relay, phone, towns.git), /claude/i) }));
    await until(() => received(relay, pi).length === 2); await settle();
    expect(received(relay, pi).map(item => item.text).join(" ")).not.toContain("TEST-3");
    expect(claudes(relay)).toEqual([]);
    await ok(relay, phone, "quest-prepare", prepare(towns.git)); // Card-only work still has budget.
    const other = await pairPhone(relay, "Other phone"); // The budget is per device.
    await ok(relay, other, "quest-prepare", prepare(towns.git, { mode: "send", heroId, text: "TEST-OTHER" }));
  }, 30000);

  it("A2 limits spawns to one per minute per device and all mutations to five per minute", async () => {
    const relay = await startRelay(), phone = await pairPhone(relay), towns = await townIds(relay, phone);
    const spawn = launchBody(await options(relay, phone, towns.git), /claude/i);
    await ok(relay, phone, "quest-prepare", prepare(towns.git, { mode: "send", launch: spawn, text: "TEST-SPAWN" }));
    const card = await ok(relay, phone, "quest-prepare", prepare(towns.git, { mode: "party" }));
    await rejected(relay, phone, "quest-embark", { requestId: requestId(), questId: card.draft.questId, launch: spawn, role: "review", writer: false });
    await spawned(relay, "claude", 1); await settle();
    expect(claudes(relay)).toHaveLength(1);
    const writer = await pairPhone(relay, "Card phone", false);
    for (let index = 0; index < 5; index++) await ok(relay, writer, "quest-prepare", prepare(towns.plain, { text: `札${index}` }));
    const before = await questCount(relay);
    await rejected(relay, writer, "quest-prepare", prepare(towns.plain, { text: "六枚目" }));
    expect(await questCount(relay)).toBe(before);
  }, 30000);

  // Reservation times are aged on disk (test-only) instead of sleeping; request IDs stay valid.
  it("A2 allows at most two live phone-started heroes per device and three spawns per hour, durable on disk", async () => {
    const relay = await startRelay(), phone = await pairPhone(relay), towns = await townIds(relay, phone);
    const spawn = launchBody(await options(relay, phone, towns.git), /claude/i);
    const launch = () => call("quest-prepare", prepare(towns.git, { mode: "send", launch: spawn }));
    const call = (operation: string, body: object) => ok(relay, phone, operation, body);
    await launch(); const first = await spawned(relay, "claude", 1); ageReservations(relay, 61_000);
    await launch(); const second = await spawned(relay, "claude", 2); ageReservations(relay, 61_000);
    await rejected(relay, phone, "quest-prepare", prepare(towns.git, { mode: "send", launch: spawn })); // Third live hero.
    await settle(); expect(claudes(relay)).toHaveLength(2);
    for (const item of [first, second]) process.kill(item.pid, "SIGTERM");
    await until(async () => ((await screen(relay, "/sessions")).json as { exited?: object }[]).every(item => item.exited));
    ageReservations(relay, 61_000);
    // No live hero remains, but three spawn reservations exist within the hour.
    await rejected(relay, phone, "quest-prepare", prepare(towns.git, { mode: "send", launch: spawn }));
    await settle(); expect(claudes(relay)).toHaveLength(2);
    ageReservations(relay, 3_600_000);
    await launch(); await spawned(relay, "claude", 3);
  }, 40000);

  it("A2 a phone launch cannot exceed the Mac's 16-terminal limit", async () => {
    const relay = await startRelay(), phone = await pairPhone(relay), towns = await townIds(relay, phone);
    const spawn = launchBody(await options(relay, phone, towns.git), /claude/i);
    for (let index = 0; index < 16; index++) expect((await screen(relay, "/sessions", "POST", { preset: "pi", cwd: relay.towns.plain })).status).toBe(201);
    await rejected(relay, phone, "quest-prepare", prepare(towns.git, { mode: "send", launch: spawn }));
    await settle(); expect(claudes(relay)).toEqual([]);
    const sessions = (await screen(relay, "/sessions")).json as { id: string }[];
    expect(sessions).toHaveLength(16);
    expect((await screen(relay, `/sessions/${sessions[0].id}`, "DELETE")).status).toBe(204);
    ageReservations(relay, 61_000);
    await ok(relay, phone, "quest-prepare", prepare(towns.git, { mode: "send", launch: spawn }));
    await spawned(relay, "claude", 1);
  }, 40000);

  it("A2 partial departure keeps an interrupted helper pending and later sends only that helper, never re-sending", async () => {
    const relay = await startRelay(), phone = await pairPhone(relay), towns = await townIds(relay, phone);
    const [one, two] = await macHeroes(relay, phone, towns.git, ["pi", "pi"]);
    const card = await ok(relay, phone, "quest-prepare", prepare(towns.git, { mode: "party", text: "TEST 本題" })), questId = card.draft.questId;
    await ok(relay, phone, "quest-form", form(questId, [member(one.heroId, "implement", true, "TEST-A"), member(two.heroId, "review", false, "TEST-B")]));
    await interrupt(relay, two.launch); // The helper cannot talk until its CLI sends a real ready hook.
    const first = await ok(relay, phone, "quest-depart", { requestId: requestId(), questId });
    expect(first.draft.departure.state).toBe("partial");
    expect(first.draft.departure.steps.map((step: { heroId: string; state: string }) => [step.heroId, step.state]))
      .toEqual([[one.heroId, "sent"], [two.heroId, "pending"]]);
    await until(() => received(relay, one.launch).length === 1); await settle();
    expect(received(relay, two.launch)).toEqual([]);
    readyAgain(two.launch); await settle(); // A real Stop hook from the same interrupted CLI process.
    const second = await ok(relay, phone, "quest-depart", { requestId: requestId(), questId });
    expect(second.draft.departure.state).toBe("complete");
    await until(() => received(relay, two.launch).length === 1); await settle();
    expect([received(relay, one.launch).length, received(relay, two.launch).length]).toEqual([1, 1]);
    expect(received(relay, one.launch)[0].text).toContain("TEST 本題"); expect(received(relay, one.launch)[0].text).not.toContain("TEST-A");
    expect(received(relay, two.launch)[0].text).toContain("TEST-B");
    // A completed departure cannot be reshaped or re-sent.
    await rejected(relay, phone, "quest-form", form(questId, [member(two.heroId, "implement", true)]));
    await rejected(relay, phone, "quest-depart", { requestId: requestId(), questId });
    await settle(); expect([received(relay, one.launch).length, received(relay, two.launch).length]).toEqual([1, 1]);
  }, 40000);
});
