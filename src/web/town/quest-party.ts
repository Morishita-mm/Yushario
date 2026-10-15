import type { PartyMember } from "../../core/party";
import type { QuestDetail } from "../../core/quests";
import type { Session } from "../terminal";
import { tr } from "../language";
import { memberBadge, memberState, openPartyWindow } from "./party-window";
import "./quest-party.css";

export type PartyHero = PartyMember & { name: string; active: boolean; canTalk?: boolean; waiting?: boolean; sessionInfo?: Session };
export type PartyControls = {
  talk: (hero: string, session: string) => void; review: (hero: string, session: string) => void; embark: () => void;
  farewell?: (hero: string) => void; sessionName?: (session: string) => string | undefined; mock?: PartyHero[];
};
const token = new URLSearchParams(location.search).get("token") ?? "";
export async function partyRequest(path: string, method = "GET", body?: unknown): Promise<any> {
  const response = await fetch(`/api/${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`, { method, cache: "no-store",
    ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error ?? tr("パーティーを よめない", "Cannot read party"));
  return result;
}
export function partyField(text: string, input: HTMLElement): HTMLLabelElement {
  const label = document.createElement("label"); label.append(document.createTextNode(text), input); return label;
}
export function partyButton(text: string, action: () => void): HTMLButtonElement {
  const button = document.createElement("button"); button.type = "button"; button.textContent = text; button.onclick = action; return button;
}
// The card shows who is in the party; forming it happens in its own window.
export function questParty(quest: QuestDetail, controls?: PartyControls, changed: () => void = () => undefined): HTMLElement {
  const root = document.createElement("section"); root.className = "quest-party";
  const list = document.createElement("ul"); list.className = "party-list";
  const open = partyButton(tr("▶ パーティーを へんせいする", "▶ Form the party"), () => openPartyWindow(quest, controls, changed));
  root.append(list, open);
  const show = (members: PartyHero[]) => {
    list.replaceChildren(...members.map((member) => {
      const item = document.createElement("li"); item.textContent = `${controls?.sessionName?.(member.session) ?? member.name}（${memberBadge(member)} · ${memberState(member)}）`; return item;
    }));
    if (!members.length) { const item = document.createElement("li"); item.textContent = tr("まだ だれも いない", "Nobody yet"); list.append(item); }
  };
  if (controls?.mock) show(controls.mock);
  else void partyRequest(`quests/${encodeURIComponent(quest.id)}/party`).then(show).catch(() => show([]));
  return root;
}
