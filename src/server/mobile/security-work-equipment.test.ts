import { afterEach, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { MobileWorkResponseBody } from "../../core/mobile-work-display";
import { mobileEffort, mobileModel } from "../../core/mobile-work";
import { launches, launchOnMac, noPrivate, ok, options, pairPhone, prepare, ready, rejected, restartRelay, screen,
  startRelay, stopAll, townIds, until, type Relay, type FakeLaunch } from "./security-work-fixture";

// All settings and executables below belong to an isolated real relay fixture, never the user's HOME.
afterEach(stopAll);
type Choices = Extract<MobileWorkResponseBody, { operation: "quest-options" }>["body"];
async function equipped(relay: Relay, preset: "claude" | "pi", weapon?: string, accessory?: string): Promise<FakeLaunch> {
  const result = await screen(relay, "/sessions", "POST", { preset, cwd: relay.towns.git, weapon, accessory });
  expect(result.status).toBe(201);
  let launch: FakeLaunch | undefined;
  await until(() => Boolean(launch = launches(relay).find(row => row.terminal === result.json.id)));
  await ready(relay, launch!); return launch!;
}

describe("SEC-22 A5 equipment display values over real relay/HTTP/crypto", () => {
  it("returns master model/effort values for choices and equipped heroes, with null for defaults", async () => {
    const relay = await startRelay(), phone = await pairPhone(relay), towns = await townIds(relay, phone);
    await equipped(relay, "claude", "legend", "high");
    await equipped(relay, "pi", undefined, "minimal");
    await launchOnMac(relay, "claude", relay.towns.git);
    const body = await ok(relay, phone, "quest-options", { townId: towns.git }) as Choices;
    const claude = body.presets.find(preset => /claude/i.test(preset.name))!;
    expect(claude.weapons.map(w => w.model)).toEqual(["haiku", "sonnet", "opus"]);
    expect(claude.accessories.map(a => a.effort)).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(body.heroes.map(h => [h.model, h.effort])).toEqual([["opus", "high"], [null, "minimal"], [null, null]]);
    for (const preset of body.presets) {
      for (const w of preset.weapons) { expect(Object.keys(w).sort()).toEqual(["id", "model", "name"]); expect(w.model === null || mobileModel(w.model)).toBe(true); }
      for (const a of preset.accessories) { expect(Object.keys(a).sort()).toEqual(["effort", "id", "name"]); expect(a.effort === null || mobileEffort(a.effort)).toBe(true); }
    }
    for (const base of body.bases) expect(Object.keys(base).sort()).toEqual(["id", "name", "townId"]);
    noPrivate(relay, body);
    const launch = { baseId: body.bases[0].id, presetId: claude.id, weaponId: claude.weapons[2].id, accessoryId: claude.accessories[2].id };
    // Values are display-only: even known values cannot replace opaque gear IDs or become input fields.
    for (const patch of [{ weaponId: "opus" }, { accessoryId: "high" }, { weaponId: "unknown-model" }, { accessoryId: "ultra" },
      { model: "opus" }, { effort: "high" }, { model: "unknown-model" }, { effort: "ultra" }]) {
      await rejected(relay, phone, "quest-prepare", prepare(towns.git, { mode: "send", launch: { ...launch, ...patch } }));
    }
    expect(launches(relay)).toHaveLength(3);
    // Existing choices still resolve by ID; the returned model/effort is not reinterpreted as an argument.
    const created = await ok(relay, phone, "quest-prepare", prepare(towns.git, { mode: "send", launch }));
    expect(created.delivery).toBe("none");
    const refreshed = await options(relay, phone, towns.git);
    expect(refreshed.heroes.find(h => h.id === created.heroId)).toMatchObject({ model: "opus", effort: "high" });
  }, 20000);

  it("keeps custom equipment while nulling unsafe/unknown metadata, without deriving values from labels", async () => {
    let relay = await startRelay();
    const models = ["openai-codex/gpt-6-astra", "Provider:Model-1.0", "X".repeat(64), "X".repeat(65),
      "/private/HIDDEN_MODEL", "C:/HIDDEN_MODEL", "--HIDDEN_FLAG", "HIDDEN argument", "https://hidden/model", "provider/../HIDDEN_MODEL"];
    const efforts = ["high", "ultra", "HIGH", "max", "off"];
    writeFileSync(join(relay.home, "equipment.json"), JSON.stringify({ claude: {
      weapons: models.map((model, i) => ({ id: `weapon-${i}`, name: "同じ武器の名前", model })),
      accessories: efforts.map((value, i) => ({ id: `accessory-${i}`, name: "同じはちまきの名前", value })),
    } }));
    relay = await restartRelay(relay);
    const phone = await pairPhone(relay), towns = await townIds(relay, phone);
    await equipped(relay, "claude", "weapon-0", "accessory-0");
    await equipped(relay, "claude", "weapon-3", "accessory-1");
    const body = await ok(relay, phone, "quest-options", { townId: towns.git }) as Choices;
    const preset = body.presets.find(preset => /claude/i.test(preset.name))!;
    expect(preset.weapons).toHaveLength(models.length); expect(preset.accessories).toHaveLength(efforts.length);
    expect(new Set(preset.weapons.map(w => w.id)).size).toBe(models.length);
    expect(preset.weapons.map(w => w.model)).toEqual([...models.slice(0, 3), ...Array(7).fill(null)]);
    expect(preset.accessories.map(a => a.effort)).toEqual(["high", null, null, "max", "off"]);
    expect(body.heroes.map(h => [h.model, h.effort])).toEqual([[models[0], "high"], [null, null]]);
    expect(body.heroes.every(h => h.weapon === "同じ武器の名前" && h.accessory === "同じはちまきの名前")).toBe(true);
    const wire = JSON.stringify(body);
    for (const hidden of [...models.slice(3), "ultra", "HIGH"]) expect(wire).not.toContain(hidden);
    noPrivate(relay, body);
    // Null display values do not remove or disable the user's registered equipment.
    const launch = { baseId: body.bases[0].id, presetId: preset.id, weaponId: preset.weapons[3].id, accessoryId: preset.accessories[1].id };
    const created = await ok(relay, phone, "quest-prepare", prepare(towns.git, { mode: "send", launch }));
    const updated = await options(relay, phone, towns.git);
    expect(updated.heroes.find(h => h.id === created.heroId)).toMatchObject({ model: null, effort: null });
  }, 20000);
});
