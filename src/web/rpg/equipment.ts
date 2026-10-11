import type { AgentEquipment, Equipment, EquipmentMaster } from "../../core/equipment";
import type { RoomAgent } from "../../core/room";
import { equipmentTiers, type EquipmentTiers } from "../../core/battle-presentation";
import { sessionRequest, type Session } from "../terminal";
import { place } from "../town/command";
import { loadAgents, type AgentInfo } from "./agents";
import { element } from "./status-card";

export async function loadEquipment(): Promise<EquipmentMaster> {
  const token = new URLSearchParams(location.search).get("token") ?? "";
  const response = await fetch(`/api/equipment?${new URLSearchParams({ token })}`, { cache: "no-store" });
  if (!response.ok) throw new Error("そうびを よみこめませんでした");
  return response.json();
}

export function equipmentLabels(gear: Equipment, master: AgentEquipment): string[] {
  const weapon = master.weapons.find((item) => item.id === gear.weapon);
  const accessory = master.accessories.find((item) => item.id === gear.accessory);
  return [`ぶき：${weapon ? `${weapon.name}（${weapon.model}）` : gear.weapon ?? "―（きほん）"}`,
    ...(master.accessories.length || gear.accessory ? [`アクセサリ：${accessory ? `${accessory.name}（${accessory.value}）` : gear.accessory ?? "―（きほん）"}`] : [])];
}

export function initEquipment(hero: (id: string) => RoomAgent | undefined, name: (id: string) => string | undefined,
  say: (text: string) => void, terminalHero: (terminal: string) => RoomAgent | undefined) {
  let master: EquipmentMaster = {}, agents: AgentInfo[] = [];
  const sessions = new Map<string, Session>();
  let pending = new Set<string>();
  let active: { terminal: string; hint: HTMLElement } | undefined;

  function remember(session: Session): void { sessions.set(session.id, session); }
  async function refresh(): Promise<void> {
    const [items, kinds, current] = await Promise.all([loadEquipment(), loadAgents(), sessionRequest()]);
    master = items; agents = kinds;
    sessions.clear(); for (const session of current as Session[]) remember(session);
  }
  function describe(terminal?: string): string[] {
    const session = terminal ? sessions.get(terminal) : undefined;
    return session && master[session.preset] ? equipmentLabels(session, master[session.preset]) : [];
  }
  function tiers(terminal?: string): EquipmentTiers {
    const session = terminal ? sessions.get(terminal) : undefined;
    return session && master[session.preset] ? equipmentTiers(session, master[session.preset]) : {};
  }
  function changed(session: Session): void {
    remember(session); pending.delete(session.id);
    const agent = terminalHero(session.id);
    if (active?.terminal === session.id) active.hint.textContent = "もちかえました！";
    const labels = describe(session.id).map((text) => text.slice(text.indexOf("：") + 1));
    say(`${agent ? name(agent.id) ?? agent.name : session.project}は ${labels.join("と ")}を そうびした！`);
  }
  function setPending(terminal: string, equipment?: Equipment): void {
    if (equipment) pending.add(terminal); else pending.delete(terminal);
    if (active?.terminal === terminal) active.hint.textContent = equipment
      ? "さぎょうが おわったら もちかえる" : "ぶき＝モデル、アクセサリ＝考える量";
  }
  function open(id: string, layer: HTMLElement, at: [number, number], dismiss: () => void): void {
    const terminal = hero(id)?.terminal;
    const session = terminal ? sessions.get(terminal) : undefined;
    const items = session && master[session.preset];
    const agent = agents.find((item) => item.id === session?.preset);
    let next: Equipment = { weapon: session?.weapon, accessory: session?.accessory };
    const close = () => { active = undefined; dismiss(); };
    const button = (label: string, action: () => void) => {
      const node = element("button", undefined, label); node.type = "button"; node.addEventListener("click", action); return node;
    };
    function render(message?: string): void {
      const box = element("div", "command-window wide equipment-window");
      box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "そうび");
      box.append(element("h4", undefined, `${name(id) ?? hero(id)?.name ?? "勇者"}の そうび`));
      const hint = element("p", "hint", message ?? (pending.has(terminal ?? "")
        ? "さぎょうが おわったら もちかえる" : "ぶき＝モデル、アクセサリ＝考える量"));
      if (terminal) active = { terminal, hint };
      const list = element("div", "commands");
      if (session && items) {
        const labels = equipmentLabels(next, items);
        const mutable = Boolean(agent?.equipWeapon || agent?.equipAccessory);
        if (!mutable) {
          for (const text of labels) box.append(element("p", undefined, text));
          hint.textContent = "途中では かえられない（しゅつじん・よびもどす時だけ）";
        } else {
          list.append(button(labels[0], () => choices("weapon")));
          if (items.accessories.length) list.append(button(labels[1], () => choices("accessory")));
          list.append(button("もちかえる", () => {
            for (const node of list.querySelectorAll<HTMLButtonElement>("button")) node.disabled = true;
            const token = new URLSearchParams(location.search).get("token") ?? "";
            void fetch(`/api/sessions/${terminal}/equip?${new URLSearchParams({ token })}`, {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next),
            }).then(async (response) => {
              const result = await response.json();
              if (!response.ok) throw new Error(result.error ?? "もちかえられませんでした");
              close(); if (!result.delivered && pending.has(terminal!)) say("さぎょうが おわったら もちかえる");
            }).catch((error: Error) => { if (!layer.hidden && layer.contains(box)) render(error.message); });
          }));
        }
      } else hint.textContent = "そうびを よみこめませんでした。とじて もういちど おためしください。";
      list.append(button("とじる", close)); box.append(hint, list); place(layer, box, at, close);
    }
    function choices(key: "weapon" | "accessory"): void {
      if (!items || !session) return;
      const box = element("div", "command-window wide equipment-window");
      box.setAttribute("role", "dialog"); box.setAttribute("aria-label", key === "weapon" ? "ぶき" : "アクセサリ");
      box.append(element("h4", undefined, key === "weapon" ? "ぶき" : "アクセサリ"));
      const list = element("div", "commands");
      const none = button("そうびなし（きほん）", () => { next = { ...next, [key]: undefined }; render(); });
      none.disabled = Boolean(session[key]); none.title = none.disabled ? "そうびなしは しゅつじん・よびもどす時だけ" : "";
      list.append(none);
      for (const item of key === "weapon" ? items.weapons : items.accessories) {
        const value = "model" in item ? item.model : item.value;
        list.append(button(`${next[key] === item.id ? "◆ " : ""}${item.name}（${value}）`, () => { next = { ...next, [key]: item.id }; render(); }));
      }
      list.append(button("もどる", () => render())); box.append(list); place(layer, box, at, () => render());
    }
    render();
  }
  return { refresh, remember, describe, tiers, changed, setPending, open, reset: () => { pending = new Set(); } };
}
