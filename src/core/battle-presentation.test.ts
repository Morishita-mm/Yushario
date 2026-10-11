import { describe, expect, it } from "vitest";
import { battlePresentation, equipmentTiers, recentBattleSuccess } from "./battle-presentation";

const master = {
  weapons: ["custom-small", "custom-normal", "custom-big", "custom-extra"].map((id) => ({ id, name: id, model: "any/model" })),
  accessories: ["quiet", "normal", "deep", "deeper", "highest", "extra", "limit"].map((id) => ({ id, name: id, value: id })),
};

describe("equipment battle presentation", () => {
  it("uses master order, including custom IDs and extra weapon tiers", () => {
    expect(equipmentTiers({}, master)).toEqual({ weaponTier: 0, accessoryTier: 0 });
    expect(equipmentTiers({ weapon: "custom-big", accessory: "deep" }, master)).toEqual({ weaponTier: 3, accessoryTier: 3 });
    expect(equipmentTiers({ weapon: "unknown", accessory: "unknown" }, master)).toEqual({ weaponTier: 0, accessoryTier: 0 });
    expect(battlePresentation(equipmentTiers({ weapon: "custom-extra" }, master), true, 1).damage).toBe(46);
  });
  it("preserves unequipped numbers and timing, including map-scale timing", () => {
    expect(battlePresentation({}, true, 0)).toEqual({ damage: 23, critical: false, windup: 600, charging: false });
    expect(battlePresentation({}, true, 0, 18, 300)).toEqual({ damage: 18, critical: false, windup: 300, charging: false });
  });
  it("makes dagger small, steel normal and legend large, with occasional deterministic critical hits", () => {
    expect(battlePresentation({ weaponTier: 1 }, true, 1).damage).toBe(12);
    expect(battlePresentation({ weaponTier: 2 }, true, 1).damage).toBe(23);
    expect(battlePresentation({ weaponTier: 3 }, true, 1).damage).toBe(46);
    expect(battlePresentation({ weaponTier: 3 }, true, 5)).toMatchObject({ damage: 69, critical: true });
    expect(battlePresentation({ weaponTier: 3 }, true, 6)).toMatchObject({ damage: 46, critical: false });
  });
  it("never turns failure or unfinished work into damage or a critical hit", () => {
    for (const success of [false, undefined]) for (const weaponTier of [0, 1, 2, 3, 4]) {
      expect(battlePresentation({ weaponTier, accessoryTier: 7 }, success, 0)).toMatchObject({ damage: undefined, critical: false });
    }
  });
  it("shows only a recent completed real result, never a running, future or stale result", () => {
    const agent = { running: false, postAt: 1000, log: [{ at: 900, activity: "edit" as const, outcome: "ok" as const }] };
    expect(recentBattleSuccess(agent, 1000)).toBe(true);
    expect(recentBattleSuccess({ ...agent, log: [{ ...agent.log[0], outcome: "failed" }] }, 1100)).toBe(false);
    expect(recentBattleSuccess({ ...agent, running: true }, 1100)).toBeUndefined();
    expect(recentBattleSuccess({ ...agent, log: [] }, 1100)).toBeUndefined();
    expect(recentBattleSuccess(agent, 999)).toBeUndefined();
    expect(recentBattleSuccess(agent, 3000)).toBeUndefined();
  });
  it("increases the charge with accessory order and shows the message only at high tiers", () => {
    const results = [0, 1, 2, 3, 4, 5, 6, 7].map((accessoryTier) => battlePresentation({ accessoryTier }, true, 1));
    expect(results.map((result) => result.windup)).toEqual([600, 600, 750, 900, 1050, 1200, 1350, 1500]);
    expect(results.map((result) => result.charging)).toEqual([false, false, false, true, true, true, true, true]);
    expect(results.every((result) => result.damage === 23 && !result.critical)).toBe(true);
  });
});
