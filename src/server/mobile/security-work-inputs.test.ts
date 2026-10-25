import { afterEach, describe, expect, it } from "vitest";
import { launchBody, launches, macHeroes, ok, options, pairPhone, prepare, questCount, received, rejected, requestId, settle,
  startRelay, stopAll, townIds, type Relay } from "./security-work-fixture";
import type { TestPhone } from "./test-client";

afterEach(stopAll);
// Each case gets a fresh relay and stays under ~20 phone requests, so every rejection reaches the real parser/rules.
async function setup(): Promise<{ relay: Relay; phone: TestPhone; towns: Record<"git" | "plain" | "other", string>; heroId: string; pi: ReturnType<typeof launches>[number] }> {
  const relay = await startRelay(), phone = await pairPhone(relay), towns = await townIds(relay, phone);
  const [{ launch: pi, heroId }] = await macHeroes(relay, phone, towns.git, ["pi"]);
  return { relay, phone, towns, heroId, pi };
}
async function unchanged(relay: Relay, pi: ReturnType<typeof launches>[number], cards: number) {
  await settle();
  expect(await questCount(relay)).toBe(cards); expect(launches(relay)).toHaveLength(1); expect(received(relay, pi)).toEqual([]);
}

describe("mobile work input boundaries (real relay process)", () => {
  it("A2 accepts the 8000-character limit but rejects longer/blank text, bad request IDs and unknown operations", async () => {
    const { relay, phone, towns, pi } = await setup();
    const longest = await ok(relay, phone, "quest-prepare", prepare(towns.git, { text: "あ".repeat(8000) }));
    expect(longest.draft.text).toHaveLength(8000);
    for (const body of [prepare(towns.git, { text: "x".repeat(8001) }), prepare(towns.git, { text: "   " }), prepare(towns.git, { mode: "active" }),
      prepare(towns.git, { requestId: "not-a-request-id" }), prepare(towns.git, { requestId: requestId(Date.now() - 11 * 60_000) }),
      prepare(towns.git, { requestId: requestId(Date.now() + 5 * 60_000) })]) await rejected(relay, phone, "quest-prepare", body);
    for (const operation of ["say", "spawn", "assign", "setoff", "quest-done", "quest-adopt"]) await rejected(relay, phone, operation, { questId: longest.draft.questId });
    await unchanged(relay, pi, 1);
  }, 30000);

  it("A2 rejects unknown, raw and cross-town heroes and towns", async () => {
    const { relay, phone, towns, heroId, pi } = await setup();
    for (const body of [prepare(towns.plain, { mode: "send", heroId }), prepare(towns.other, { heroId }), prepare(towns.git, { mode: "send", heroId: "unknown-hero" }),
      prepare(towns.git, { mode: "send", heroId: pi.terminal }), prepare(relay.towns.git), prepare("unknown-town"),
      { ...prepare(towns.git), session: pi.terminal }, { ...prepare(towns.git), state: "active" }]) await rejected(relay, phone, "quest-prepare", body);
    await unchanged(relay, pi, 0);
  }, 30000);

  it("A2 rejects unknown, raw, stale-town and cross-town base/preset/gear IDs for a launch", async () => {
    const { relay, phone, towns, pi } = await setup();
    const git = await options(relay, phone, towns.git), other = await options(relay, phone, towns.other), good = launchBody(git, /claude/i);
    for (const patch of [{ baseId: other.bases[0].id }, { baseId: "unknown-base" }, { baseId: relay.towns.git },
      ...["pi", "claude", "codex", "shell", "unknown"].map(presetId => ({ presetId })), { presetId: launchBody(git, /codex/i).presetId, weaponId: git.presets.find(item => /claude/i.test(item.name))!.weapons[0]?.id ?? "w" },
      { weaponId: "unknown-weapon" }, { accessoryId: "unknown-accessory" }]) {
      await rejected(relay, phone, "quest-prepare", prepare(towns.git, { mode: "send", launch: { ...good, ...patch } }));
    }
    await unchanged(relay, pi, 0);
  }, 30000);

  it("A2 rejects injected cwd/args/env/permission/sandbox/command fields at both levels", async () => {
    const { relay, phone, towns, pi } = await setup();
    const good = launchBody(await options(relay, phone, towns.git), /claude/i);
    for (const field of [{ cwd: relay.towns.other }, { args: ["--dangerously-skip-permissions"] }, { env: { PATH: "/tmp" } },
      { permissionMode: "bypassPermissions" }, { sandbox: "danger-full-access" }, { command: "sh" }]) {
      await rejected(relay, phone, "quest-prepare", prepare(towns.git, { mode: "send", launch: { ...good, ...field } }));
      await rejected(relay, phone, "quest-prepare", { ...prepare(towns.git, { mode: "send", launch: good }), ...field });
    }
    await unchanged(relay, pi, 0);
  }, 30000);
});
