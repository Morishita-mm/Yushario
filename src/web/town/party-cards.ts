import { roleLabel } from "../../core/party";
import { language, tr } from "../language";
import { iconLabel } from "../icons.js";
import type { HeroInfo, PartyHero } from "./quest-party";

// Building blocks of the party window: plain elements, command lines and hero cards.
export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node;
};
export const command = (text: string, run: () => void, primary = false): HTMLButtonElement => {
  const node = el("button", primary ? "pw-command primary" : "pw-command", text); node.type = "button"; node.onclick = run; return node;
};
export const memberState = (member: PartyHero): string => !member.canTalk ? tr("ターミナルのみ", "Terminal only")
  : !member.active ? tr("去った", "Left") : member.waiting ? tr("待っている", "Ready") : tr("作業中", "Working");
// An "implement" member who does not write is left from an owner change or a departed owner: a reserve who can be made owner.
export const memberBadge = (member: PartyHero): string => member.writer ? tr("担当", "Owner")
  : member.role === "command" ? tr("しき", "Commander") : member.role === "implement" ? tr("控え（担当に できる）", "Reserve (can be made owner)")
  : tr(`手伝い · ${roleLabel(member.role, language)}`, `Helper · ${roleLabel(member.role, language)}`);

// A card per hero, like a party screen: picture, name, role, CLI and level, model and effort, MP and state.
export type CardFacts = { session: string; name: string; preset?: string; badge: string; writer: boolean; state: string; info: HeroInfo; notes: string[] };
export function heroCard(facts: CardFacts, pick: () => void, small = false): HTMLButtonElement {
  const { info } = facts, node = command("", pick); node.classList.add("pw-card"); if (small) node.classList.add("small");
  if (facts.writer && !small) node.classList.add("writer");
  const picture = el("span", "pw-picture"); if (info.portrait) picture.append(info.portrait);
  const mp = el("span", "pw-mp"), fill = el("span"); fill.style.width = `${Math.round((info.mp ?? 0) * 100)}%`; mp.append(fill);
  mp.title = `MP ${info.mp === undefined ? "？" : Math.round(info.mp * 100)}`; mp.classList.toggle("unknown", info.mp === undefined);
  const role = el("span", facts.writer && !small ? "pw-badge writer" : "pw-badge");
  role.append(facts.writer ? iconLabel("edit", facts.badge) : facts.badge);
  node.append(picture, el("span", "pw-name", facts.name), role,
    el("span", "pw-kind", `${facts.preset ?? "?"}${info.level !== undefined ? ` · Lv ${info.level}` : ""}`), el("span", "pw-gear", info.gear ?? tr("モデル・考える量 不明", "Model and effort unknown")));
  if (!small) node.append(mp);
  node.append(el("span", "pw-state", facts.state));
  for (const note of facts.notes) node.append(el("span", "pw-outside", note));
  node.setAttribute("aria-label", [facts.name, facts.badge, facts.preset, info.gear, facts.state, ...facts.notes].filter(Boolean).join(" · "));
  return node;
}
