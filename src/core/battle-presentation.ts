import type { AgentEquipment, Equipment } from "./equipment";
import type { RoomAgent } from "./room";

export type EquipmentTiers = { weaponTier?: number; accessoryTier?: number };

// The master's order, not item IDs or model/provider names, determines appearance.
export function equipmentTiers(gear: Equipment, master: AgentEquipment): EquipmentTiers {
  return {
    weaponTier: master.weapons.findIndex((item) => item.id === gear.weapon) + 1,
    accessoryTier: master.accessories.findIndex((item) => item.id === gear.accessory) + 1,
  };
}

export function recentBattleSuccess(agent: Pick<RoomAgent, "log" | "running" | "postAt">, now: number): boolean | undefined {
  const last = agent.log.at(-1);
  return !agent.running && now >= agent.postAt && now - agent.postAt < 2000 && last?.outcome
    ? last.outcome === "ok" : undefined;
}

// Presentation only: the caller supplies the actual result and a deterministic attack beat.
// Undefined success means no result yet; never manufacture a successful hit from equipment.
export function battlePresentation(tiers: EquipmentTiers, success: boolean | undefined, beat: number,
  baseDamage = 23, baseWindup = 600) {
  const weapon = Math.min(3, Math.max(0, Math.floor(tiers.weaponTier ?? 0)));
  const accessory = Math.min(7, Math.max(0, Math.floor(tiers.accessoryTier ?? 0)));
  const critical = success === true && weapon === 3 && Math.floor(beat) % 5 === 0;
  const multiplier = weapon === 1 ? 0.5 : weapon === 3 ? (critical ? 3 : 2) : 1;
  return {
    damage: success === true ? Math.max(1, Math.round(baseDamage * multiplier)) : undefined,
    critical,
    windup: baseWindup + Math.max(0, accessory - 1) * 150,
    charging: accessory >= 3,
  };
}
