import type { PartyMember } from "../../core/party";
import { finishedQuest, type QuestDetail } from "../../core/quests";
import type { Session } from "../terminal";
import { tr } from "../language";
import { openPartyWindow } from "./party-window";
import { memberBadge, memberState } from "./party-cards";
import type { TacticStatus } from "../../core/tactics";
import "./quest-party.css";
import { iconLabel } from "../icons.js";

export type PartyHero = PartyMember & { name: string; active: boolean; canTalk?: boolean; waiting?: boolean; sessionInfo?: Session };
// What a card shows beyond the party record: the hero's picture, gear, MP and level.
export type HeroInfo = { portrait?: HTMLCanvasElement; gear?: string; mp?: number; level?: number; here?: boolean };
export type PartyControls = {
  talk: (hero: string, session: string) => void; review: (hero: string, session: string) => void; embark: (back?: () => void, arrived?: (session: Session) => void) => void;
  farewell?: (hero: string) => void; sessionName?: (session: string) => string | undefined; heroInfo?: (session: string) => HeroInfo; savedGear?: (preset: string | undefined, gear: { weapon?: string; accessory?: string }) => string; mock?: PartyHero[];
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
// The quest card's party: one row per member who is here, with their role, model and state, to direct
// the party while the quest runs (docs/PLATFORM.md stage 27). Forming the party happens in its own window.
export function questParty(quest: QuestDetail, controls?: PartyControls, changed: () => void = () => undefined, tactic?: TacticStatus): HTMLElement {
  const root = document.createElement("section"); root.className = "quest-party";
  const list = document.createElement("div"); list.className = "party-rows";
  const status = document.createElement("p"); status.className = "party-status"; status.setAttribute("role", "status");
  const open = partyButton(tr("▶ パーティーを へんせいする", "▶ Form the party"), () => openPartyWindow(quest, controls, changed));
  root.append(list, status, open);
  const prefix = `quests/${encodeURIComponent(quest.id)}`;
  const nameOf = (member: PartyHero) => { const name = controls?.sessionName?.(member.session) ?? member.name; return name === member.session ? tr("去った勇者", "A hero who left") : name; };
  const lastReport = (member: PartyHero) => quest.events.filter((event) => event.kind === "report" && event.session === member.session).sort((a, b) => b.at - a.at || b.id - a.id)[0];
  // One box under a row at a time: an order for that hero, or a helper's report.
  let opened: HTMLElement | undefined;
  const place = (row: HTMLElement, box: HTMLElement) => { opened?.remove(); opened = box; row.after(box); };
  function order(row: HTMLElement, to: PartyHero, value = "", heading = tr(`${nameOf(to)}への 指示`, `Order for ${nameOf(to)}`)): void {
    const box = document.createElement("div"), text = document.createElement("textarea"); box.className = "party-order";
    text.rows = 4; text.maxLength = 8000; text.value = value;
    const send = partyButton(tr("▶ 送る", "▶ Send"), () => {
      if (!text.value.trim()) { text.focus(); return; }
      send.disabled = true;
      void partyRequest(`${prefix}/send`, "POST", { session: to.session, text: text.value }).then((result) => {
        box.remove(); opened = undefined;
        status.textContent = result.delivered ? tr(`${nameOf(to)}に 届けた`, `Delivered to ${nameOf(to)}`) : tr(`${nameOf(to)}は 作業中。手が あいたら 届く`, `${nameOf(to)} is busy; it arrives when the hero is free`);
      }).catch((error: Error) => { send.disabled = false; status.textContent = error.message; });
    });
    const parts: HTMLElement[] = [partyField(heading, text)];
    if (tactic?.running) parts.push(Object.assign(document.createElement("p"), { className: "party-warn", textContent: tr("作戦が 動いている。これは 作戦の 外の 指示に なる。", "A tactic is running; this order is outside it.") }));
    box.append(...parts, send, partyButton(tr("やめる", "Cancel"), () => { box.remove(); opened = undefined; }));
    place(row, box); text.focus();
  }
  const show = (members: PartyHero[]) => {
    const here = members.filter((member) => member.active), owner = here.find((member) => member.writer);
    list.replaceChildren(...here.flatMap((member) => {
      const row = document.createElement("div"); row.className = member.writer ? "party-row writer" : "party-row";
      const role = document.createElement("span"); role.className = "party-role"; role.append(member.writer ? iconLabel("edit", memberBadge(member)) : memberBadge(member));
      const facts = document.createElement("span"); facts.className = "party-facts";
      facts.textContent = [nameOf(member), controls?.heroInfo?.(member.session).gear, memberState(member)].filter(Boolean).join(" · ");
      const buttons = document.createElement("span"); buttons.className = "party-actions";
      if (member.canTalk && !finishedQuest(quest.state)) buttons.append(partyButton(tr("指示", "Order"), () => order(row, member)));
      if (member.hero) buttons.append(partyButton(tr("はなす", "Talk"), () => controls?.talk(member.hero!, member.session)));
      const report = !member.writer ? lastReport(member) : undefined;
      if (report) buttons.append(partyButton(tr("報告", "Report"), () => {
        const box = document.createElement("div"); box.className = "party-order";
        const body = document.createElement("pre"); body.textContent = report.text ?? report.title;
        box.append(body);
        if (owner?.canTalk && !finishedQuest(quest.state)) box.append(partyButton(tr(`▶ 担当（${nameOf(owner)}）に 渡す`, `▶ Pass to the owner (${nameOf(owner)})`), () =>
          order(row, owner, tr(`${nameOf(member)}（${memberBadge(member)}）から 報告が 届きました。これを もとに 進めてください。\n\n${report.text ?? report.title}`,
            `${nameOf(member)} (${memberBadge(member)}) reported. Build on this.\n\n${report.text ?? report.title}`), tr(`担当（${nameOf(owner)}）に 渡す 文`, `Message for the owner (${nameOf(owner)})`))));
        box.append(partyButton(tr("とじる", "Close"), () => { box.remove(); opened = undefined; }));
        place(row, box);
      }));
      row.append(role, facts, buttons);
      return [row];
    }));
    if (!here.length) list.append(Object.assign(document.createElement("p"), { className: "hint", textContent: tr("まだ だれも いない", "Nobody yet") }));
  };
  if (controls?.mock) show(controls.mock);
  else void partyRequest(`${prefix}/party`).then(show).catch(() => show([]));
  return root;
}
