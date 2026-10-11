export type Weapon = { id: string; name: string; model: string };
export type Accessory = { id: string; name: string; value: string };
export type AgentEquipment = { weapons: Weapon[]; accessories: Accessory[] };
export type EquipmentMaster = Record<string, AgentEquipment>;
export type Equipment = { weapon?: string; accessory?: string };
export type EquipmentControls = {
  modelArg: string; thinkingArg: string; modelCommand: string; thinkingCommand: string;
};

const object = (input: unknown): input is Record<string, unknown> => Boolean(input) && typeof input === "object" && !Array.isArray(input);
const singleLine = (input: unknown): input is string => typeof input === "string" && input.length > 0
  && input.length <= 200 && !/[\u0000-\u001f\u007f]/.test(input);
export function isEquipmentId(input: unknown): input is string {
  return typeof input === "string" && /^[a-z][a-z0-9-]{0,39}$/.test(input);
}

export function parseEquipmentMaster(input: unknown): EquipmentMaster {
  if (!object(input)) throw new Error("そうびの マスタが 正しくありません");
  const result: EquipmentMaster = {};
  for (const [agent, items] of Object.entries(input)) {
    if (!isEquipmentId(agent) || !object(items) || !Array.isArray(items.weapons) || !Array.isArray(items.accessories)) {
      throw new Error("そうびの マスタが 正しくありません");
    }
    const parse = (entries: unknown[], key: "model" | "value") => {
      const ids = new Set<string>();
      return entries.map((entry) => {
        if (!object(entry) || !isEquipmentId(entry.id) || ids.has(entry.id)
          || !singleLine(entry.name) || !singleLine(entry[key])) throw new Error("そうびの マスタが 正しくありません");
        ids.add(entry.id);
        return { id: entry.id, name: entry.name, [key]: entry[key] };
      });
    };
    result[agent] = { weapons: parse(items.weapons, "model") as Weapon[], accessories: parse(items.accessories, "value") as Accessory[] };
  }
  return result;
}

// Replace a whole agent entry; never append individual tiers or accessories.
export function resolveEquipmentMaster(defaults: EquipmentMaster, override?: unknown): EquipmentMaster {
  if (override === undefined) return { ...defaults };
  const additions = parseEquipmentMaster(override);
  if (Object.keys(additions).some((agent) => !Object.hasOwn(defaults, agent))) throw new Error("知らない 勇者の そうびです");
  return { ...defaults, ...additions };
}

export function equipmentInput(input: unknown, master: AgentEquipment): Equipment {
  if (!object(input)) throw new Error("そうびを 指定してください");
  const result: Equipment = {};
  for (const key of ["weapon", "accessory"] as const) {
    const id = input[key];
    if (id === undefined) continue;
    const entries = key === "weapon" ? master.weapons : master.accessories;
    if (!isEquipmentId(id) || !entries.some((item) => item.id === id)) throw new Error("そうびの ID が 正しくありません");
    result[key] = id;
  }
  return result;
}

export function equipmentArgs(equipment: Equipment, master: AgentEquipment, controls: EquipmentControls): string[] {
  const selected = equipmentInput(equipment, master);
  const weapon = master.weapons.find((item) => item.id === selected.weapon);
  const accessory = master.accessories.find((item) => item.id === selected.accessory);
  if ((weapon && !controls.modelArg) || (accessory && !controls.thinkingArg)) throw new Error("この勇者は そのそうびに 対応していません");
  return [...(weapon ? [controls.modelArg, weapon.model] : []), ...(accessory ? [controls.thinkingArg, accessory.value] : [])];
}

export function equipmentCommands(current: Equipment, next: Equipment, master: AgentEquipment, controls: EquipmentControls): string[] {
  equipmentInput(next, master);
  const commands: string[] = [];
  for (const key of ["weapon", "accessory"] as const) {
    // Pi's model command also restores that model's thinking level: reapply the accessory.
    if (current[key] === next[key] && !(key === "accessory" && current.weapon !== next.weapon && next.accessory)) continue;
    if (!next[key]) throw new Error("そうびなしは しゅつじん・よびもどす時だけ えらべます");
    const command = key === "weapon" ? controls.modelCommand : controls.thinkingCommand;
    if (!command) throw new Error("途中では かえられません。しゅつじん・よびもどす時だけ かえられます");
    const value = key === "weapon" ? master.weapons.find((item) => item.id === next.weapon)!.model
      : master.accessories.find((item) => item.id === next.accessory)!.value;
    commands.push(`${command} ${value}`);
  }
  return commands;
}
