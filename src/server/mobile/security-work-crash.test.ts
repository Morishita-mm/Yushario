import { afterEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { form, interrupt, macHeroes, member, mobileFile, ok, pairPhone, prepare, received, rejected, requestId, restartRelay, settle,
  startRelay, stopAll, stopRelay, townIds, until, type Relay } from "./security-work-fixture";
import type { TestPhone } from "./test-client";

afterEach(stopAll);
const SECRET = "TEST-SECRET";
// Durable mobile files hold only IDs, signatures and step metadata, never the request text or instructions.
function noTextOnDisk(relay: Relay): void {
  for (const name of ["work-departures.json", "quest-requests.json", "work-audit.jsonl"]) {
    if (existsSync(mobileFile(relay, name))) expect(readFileSync(mobileFile(relay, name), "utf8")).not.toContain(SECRET);
  }
}
async function formed(relay: Relay, phone: TestPhone, interruptHelper: boolean) {
  const towns = await townIds(relay, phone), [owner, helper] = await macHeroes(relay, phone, towns.git, ["pi", "pi"]);
  const card = await ok(relay, phone, "quest-prepare", prepare(towns.git, { mode: "party", text: `${SECRET} 本題` })), questId = card.draft.questId as string;
  await ok(relay, phone, "quest-form", form(questId, [member(owner.heroId, "implement", true), member(helper.heroId, "review", false, `${SECRET}-ASK`)], "obey", `${SECRET} 本題`));
  if (interruptHelper) await interrupt(relay, helper.launch);
  return { questId, owner, helper };
}
const journal = (relay: Relay) => JSON.parse(readFileSync(mobileFile(relay, "work-departures.json"), "utf8"));

describe("mobile work crash/restart behaviour (real relay process restarts)", () => {
  it("A2 a restart loses unsent instructions (draftLost) without inventing them; an unstarted form can be saved again", async () => {
    let relay = await startRelay();
    const phone = await pairPhone(relay), { questId } = await formed(relay, phone, false);
    expect(journal(relay)).toEqual({ forms: [questId], departures: [] }); noTextOnDisk(relay);
    relay = await restartRelay(relay);
    const towns = await townIds(relay, phone), [owner, helper] = await macHeroes(relay, phone, towns.git, ["pi", "pi"]);
    const lost = (await ok(relay, phone, "quest-draft", { questId })).draft;
    expect(lost).toMatchObject({ draftLost: true, text: "", editable: true, departure: { state: "not-started", steps: [] } });
    expect(JSON.stringify(lost)).not.toContain(SECRET);
    await rejected(relay, phone, "quest-depart", { requestId: requestId(), questId });
    const again = await ok(relay, phone, "quest-form", form(questId, [member(owner.heroId, "implement", true), member(helper.heroId, "review", false, "TEST-NEW-ASK")], "obey", "TEST 再入力"));
    expect(again.draft).toMatchObject({ draftLost: false, text: "TEST 再入力" });
    expect((await ok(relay, phone, "quest-depart", { requestId: requestId(), questId })).draft.departure.state).toBe("complete");
    await until(() => received(relay, owner.launch).length === 1 && received(relay, helper.launch).length === 1);
    expect(received(relay, owner.launch)[0].text).toContain("TEST 再入力"); expect(received(relay, helper.launch)[0].text).toContain("TEST-NEW-ASK");
    noTextOnDisk(relay);
  }, 40000);

  it("A2 a partial departure interrupted by a restart becomes uncertain and is never resumed or re-formed", async () => {
    let relay = await startRelay();
    const phone = await pairPhone(relay), { questId, owner, helper } = await formed(relay, phone, true);
    expect((await ok(relay, phone, "quest-depart", { requestId: requestId(), questId })).draft.departure.state).toBe("partial");
    await until(() => received(relay, owner.launch).length === 1);
    const saved = journal(relay);
    expect(Object.keys(saved).sort()).toEqual(["departures", "forms"]);
    expect(saved.departures).toEqual([{ questId, signature: expect.stringMatching(/^[a-f0-9]{64}$/), steps: [
      { heroId: owner.heroId, kind: "request", state: "sent" }, { heroId: helper.heroId, kind: "ask", state: "pending" }] }]);
    noTextOnDisk(relay);
    relay = await restartRelay(relay);
    const towns = await townIds(relay, phone), [fresh] = await macHeroes(relay, phone, towns.git, ["pi"]);
    expect((await ok(relay, phone, "quest-draft", { questId })).draft).toMatchObject({ editable: false, departure: { state: "uncertain" } });
    await rejected(relay, phone, "quest-depart", { requestId: requestId(), questId });
    await rejected(relay, phone, "quest-form", form(questId, [member(fresh.heroId, "implement", true)]));
    await settle(); expect(received(relay, fresh.launch)).toEqual([]); expect(received(relay, helper.launch)).toEqual([]);
  }, 40000);

  // Simulated, not a real SIGKILL at the hook point: the journal is seeded with the durable "unknown"
  // mark that MobileDepartures writes immediately before a send, as if the process died right after it.
  it("A2 a step left unknown by a crash in the durable pre-send window (simulated by seeding the journal) is never retried", async () => {
    let relay = await startRelay();
    const phone = await pairPhone(relay), { questId } = await formed(relay, phone, false);
    expect((await ok(relay, phone, "quest-depart", { requestId: requestId(), questId })).draft.departure.state).toBe("complete");
    await stopRelay(relay, true);
    const saved = journal(relay);
    saved.departures[0].steps[1].state = "unknown";
    writeFileSync(mobileFile(relay, "work-departures.json"), JSON.stringify(saved), { mode: 0o600 });
    relay = await startRelay(relay);
    const towns = await townIds(relay, phone), [fresh] = await macHeroes(relay, phone, towns.git, ["pi"]);
    const draft = (await ok(relay, phone, "quest-draft", { questId })).draft;
    expect(draft.departure.state).toBe("uncertain"); expect(draft.departure.steps[1].state).toBe("unknown");
    await rejected(relay, phone, "quest-depart", { requestId: requestId(), questId });
    await rejected(relay, phone, "quest-form", form(questId, [member(fresh.heroId, "implement", true)]));
    await settle(); expect(received(relay, fresh.launch)).toEqual([]);
  }, 40000);

  it("A2 fails closed on a damaged departure journal and leaves it untouched", async () => {
    const relay = await startRelay();
    await stopRelay(relay, true);
    writeFileSync(mobileFile(relay, "work-departures.json"), "{damaged", { mode: 0o600 });
    await expect(startRelay(relay)).rejects.toThrow();
    expect(readFileSync(mobileFile(relay, "work-departures.json"), "utf8")).toBe("{damaged");
  }, 30000);
});
