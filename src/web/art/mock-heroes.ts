import { tr } from "../language";
import type { AgentEquipment, Equipment } from "../../core/equipment";
import { equipmentTiers } from "../../core/battle-presentation";
import { element, option, place, showHeroCommands } from "../town/command";
import type { Walker } from "../town/walkers";

// Mock: the app's own hero command window, with fake heroes and fake equipment (docs/PLATFORM.md stage 7).
// Same items as src/server/equipment.json; changing them only changes this page (and the sword on the map).
const MASTER: Record<"claude" | "pi", AgentEquipment> = {
  claude: {
    weapons: [{ id: "dagger", name: tr("たんけん", "Dagger"), model: "haiku" }, { id: "steel", name: tr("はがねの つるぎ", "Steel Sword"), model: "sonnet" },
      { id: "legend", name: tr("でんせつの つるぎ", "Legendary Sword"), model: "opus" }],
    accessories: ["low:かるく", "medium:ふつう", "high:ためる", "xhigh:ためにためる", "max:げんかい"].map((pair) => {
      const [id, label] = pair.split(":"); return { id, name: tr(`きあいの はちまき（${label}）`, `Spirit Band (${id === "xhigh" ? "extra high" : id})`), value: id };
    }),
  },
  pi: {
    weapons: [],
    accessories: ["off:ひとやすみ", "minimal:すこし", "low:かるく", "medium:ふつう", "high:ためる", "xhigh:ためにためる", "max:げんかい"].map((pair) => {
      const [id, label] = pair.split(":"); return { id, name: tr(`きあいの はちまき（${label}）`, `Spirit Band (${id === "xhigh" ? "extra high" : id})`), value: id };
    }),
  },
};
const LABELS = { claude: "Claude Code", pi: "pi" };
const gear = new Map<string, Equipment>();
const kind = (name: string): "claude" | "pi" => name.length % 3 === 0 ? "pi" : "claude";

function labels(name: string): string[] {
  const items = MASTER[kind(name)], current = gear.get(name) ?? {};
  const weapon = items.weapons.find((item) => item.id === current.weapon);
  const accessory = items.accessories.find((item) => item.id === current.accessory);
  return [...(items.weapons.length ? [tr(`ぶき：${weapon ? `${weapon.name}（${weapon.model}）` : "―（きほん）"}`, `Weapon: ${weapon ? `${weapon.name} (${weapon.model})` : "— (default)"}`)] : []),
    tr(`アクセサリ：${accessory ? `${accessory.name}（${accessory.value}）` : "―（きほん）"}`, `Accessory: ${accessory ? `${accessory.name} (${accessory.value})` : "— (default)"}`)];
}

export function mockHeroCommands(layer: HTMLElement, name: string, at: [number, number], fighting: boolean, walkers: Walker[], on: {
  watch?: () => void; talk: () => void; farewell: () => void; toast: (text: string) => void;
}): void {
  const { toast } = on;
  const equip = (target: HTMLElement, point: [number, number], dismiss: () => void) => showEquipment(target, name, point, walkers, toast, dismiss);
  const dismiss = showHeroCommands(layer, name, at, {
    working: fighting, watch: on.watch, talk: on.talk, closed: () => undefined,
    status: () => showStatus(layer, name, at, fighting, () => equip(layer, at, () => dismiss())),
    follow: () => toast(tr(`${name}に ついていく`, `Following ${name}`)),
    terminal: () => toast(tr("いまは ひらけない", "Cannot open now")),
    plan: (text) => toast(tr(`${name} に さくせん「${text}」を つたえた`, `Sent tactics to ${name}: ${text}`)),
    interrupt: () => toast(tr(`${name} は たたかいから にげだした！`, `${name} fled the battle!`)),
    compact: () => toast(tr(`${name} は おはなしを まとめた`, `${name} rested`)),
    farewell: on.farewell, equip,
  });
}

function showStatus(layer: HTMLElement, name: string, at: [number, number], fighting: boolean, change: () => void): void {
  const box = element("div", "command-window wide");
  box.setAttribute("role", "dialog"); box.setAttribute("aria-label", tr(`${name}の ようす`, `${name}'s status`));
  box.append(element("h4", undefined, tr(`${name}の ようす（${LABELS[kind(name)]}）`, `${name}'s status (${LABELS[kind(name)]})`)),
    element("p", "hint", fighting ? tr("▶ まものと たたかっている", "▶ Battling a monster") : tr("▶ まちで ひとやすみしている", "▶ Resting in town")), element("p", undefined, tr("そうび", "Equipment")));
  for (const text of labels(name)) box.append(element("p", "hint", text));
  const list = element("div", "commands");
  list.append(option(tr("そうびを かえる", "Change equipment"), change), option(tr("とじる", "Close"), () => { layer.hidden = true; }));
  box.append(list);
  place(layer, box, at, () => { layer.hidden = true; });
}

function showEquipment(layer: HTMLElement, name: string, at: [number, number], walkers: Walker[],
  toast: (text: string) => void, dismiss: () => void): void {
  const items = MASTER[kind(name)];
  const render = () => {
    const box = element("div", "command-window wide equipment-window");
    box.setAttribute("role", "dialog"); box.setAttribute("aria-label", tr("そうび", "Equipment"));
    box.append(element("h4", undefined, tr(`${name}の そうび`, `${name}'s equipment`)));
    const list = element("div", "commands");
    const [weaponLabel, accessoryLabel] = items.weapons.length ? labels(name) : [undefined, labels(name)[0]];
    if (weaponLabel) list.append(option(weaponLabel, () => choices("weapon")));
    list.append(option(accessoryLabel!, () => choices("accessory")), option(tr("とじる", "Close"), dismiss));
    box.append(list);
    place(layer, box, at, dismiss);
  };
  const choices = (key: "weapon" | "accessory") => {
    const box = element("div", "command-window wide equipment-window");
    box.append(element("h4", undefined, key === "weapon" ? tr("ぶき", "Weapon") : tr("アクセサリ", "Accessory")));
    const list = element("div", "commands"), current = gear.get(name) ?? {};
    for (const item of key === "weapon" ? items.weapons : items.accessories) {
      list.append(option(`${current[key] === item.id ? "◆ " : ""}${item.name}`, () => {
        const next = { ...current, [key]: item.id };
        gear.set(name, next);
        const walker = walkers.find((w) => w.name === name);
        if (walker) walker.weaponTier = equipmentTiers(next, items).weaponTier;
        toast(tr(`${name}は ${item.name}を そうびした！`, `${name} equipped ${item.name}!`));
        render();
      }));
    }
    list.append(option(tr("もどる", "Back"), render));
    box.append(list);
    place(layer, box, at, render);
  };
  render();
}
