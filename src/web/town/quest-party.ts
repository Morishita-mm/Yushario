import type { PartyMember, PartyRole } from "../../core/party";
import type { TalkEntry } from "../../core/turns";
import { finishedQuest, type QuestDetail, type QuestEvent } from "../../core/quests";
import type { Session } from "../terminal";
import { language, tr } from "../language";
import { openPartyWindow } from "./party-window";
import { memberBadge, memberState } from "./party-cards";
import { tacticLabel, type TacticStatus } from "../../core/tactics";
import { tacticProgress } from "./party-tactics";
import "./quest-party.css";
import { iconLabel } from "../icons.js";

export type PartyHero = PartyMember & { name: string; active: boolean; canTalk?: boolean; waiting?: boolean; sessionInfo?: Session };
// What a card shows beyond the party record: the hero's picture, gear, MP and level.
// `talk`: the conversation this page has seen, which has the words even when the quest log keeps none.
export type HeroInfo = { portrait?: HTMLCanvasElement; gear?: string; mp?: number; level?: number; here?: boolean; doing?: string; talk?: readonly TalkEntry[] };
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
// The quest card's party (docs/PLATFORM.md stage 27): one card per member who is here, so a glance answers
// who has which role and model, who is working, who is waiting for you, and what to do with each.
// Forming the party (who, roles, tactic) happens in its own window.
const ROLE_ORDER: Record<PartyRole, number> = { command: 0, research: 1, implement: 2, review: 3, test: 4 };
const ASKS = new Set(["request", "command", "tactic", "handoff"]);
const firstLine = (text: string) => text.split(/\r?\n/).find((line) => line.trim())?.trim() ?? "";
const ago = (at: number) => { const minutes = Math.floor((Date.now() - at) / 60_000); return minutes < 1 ? tr("いま", "just now") : tr(`${minutes}分前`, `${minutes}m ago`); };
function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const item = document.createElement(tag); item.className = className; if (text !== undefined) item.textContent = text; return item;
}

export function questParty(quest: QuestDetail, controls?: PartyControls, changed: () => void = () => undefined, tactic?: TacticStatus): HTMLElement {
  const root = node("section", "quest-party"), plan = node("p", "party-plan"), grid = node("div", "party-cards");
  const status = node("p", "party-status"); status.setAttribute("role", "status");
  const away = node("p", "party-away"), open = partyButton(tr("▶ パーティー編成（仲間・役・作戦）", "▶ Form the party (heroes, roles, tactic)"), () => openPartyWindow(quest, controls, changed));
  root.append(plan, grid, status, away, open);
  const live = !finishedQuest(quest.state), prefix = `quests/${encodeURIComponent(quest.id)}`;
  plan.textContent = tactic?.running || tactic?.stopped || tactic?.done ? tacticProgress(tactic)
    : tactic?.tactic && tactic.tactic !== "obey" ? tr(`さくせん：${tacticLabel(tactic.tactic, language)}`, `Tactic: ${tacticLabel(tactic.tactic, language)}`)
    : tr("さくせん：命令に従え — 仲間への指示は あなたから", "Tactic: Follow orders — you direct each hero");
  const nameOf = (member: PartyHero) => { const name = controls?.sessionName?.(member.session) ?? member.name; return name === member.session ? tr("去った勇者", "A hero who left") : name; };
  const latest = (member: PartyHero, kinds: (kind: string) => boolean) => quest.events.filter((event) => event.session === member.session && kinds(event.kind)).sort((a, b) => b.at - a.at || b.id - a.id)[0];
  // The words of a request or report: the quest log's copy, else the conversation this page saw. A report takes only
  // the reply of that same turn end (same time); a turn that ended without text has none, never an older reply.
  const words = (member: PartyHero, event: QuestEvent, from: TalkEntry["from"]) => event.text
    ?? controls?.heroInfo?.(member.session).talk?.filter((entry) => entry.from === from && (from === "hero" ? entry.at === event.at : Math.abs(entry.at - event.at) < 120_000))
      .sort((a, b) => Math.abs(a.at - event.at) - Math.abs(b.at - event.at))[0]?.text;
  // One box under the cards at a time: an order for one hero, or a report.
  let opened: HTMLElement | undefined;
  const mark = (session?: string) => grid.querySelectorAll<HTMLElement>(".party-card").forEach((item) => item.classList.toggle("open", item.dataset.session === session));
  const place = (box: HTMLElement, session: string) => { opened?.remove(); opened = box; box.className = "party-order"; grid.after(box); mark(session); box.querySelector<HTMLElement>("textarea, button")?.focus(); };
  const shut = () => { opened?.remove(); opened = undefined; mark(); };
  function order(to: PartyHero, value = "", heading = tr(`${nameOf(to)}（${memberBadge(to)}）への 指示`, `Order for ${nameOf(to)} (${memberBadge(to)})`)): void {
    const box = document.createElement("div"), text = document.createElement("textarea"); text.rows = 5; text.maxLength = 8000; text.value = value;
    const send = partyButton(tr("送る", "Send"), () => {
      if (!text.value.trim()) { text.focus(); return; }
      send.disabled = true;
      void partyRequest(`${prefix}/send`, "POST", { session: to.session, text: text.value }).then((result) => {
        shut(); status.textContent = result.delivered ? tr(`${nameOf(to)}に 届けた`, `Delivered to ${nameOf(to)}`) : tr(`${nameOf(to)}は 作業中。手が あいたら 届く`, `${nameOf(to)} is busy; it arrives when the hero is free`);
      }).catch((error: Error) => { send.disabled = false; status.textContent = error.message; });
    });
    box.append(partyField(heading, text));
    if (tactic?.running) box.append(node("p", "party-warn", tr("作戦の実行中。この指示は 作戦の外で送る。", "A tactic is running; this order is outside it.")));
    send.classList.add("primary");
    const row = node("div", "party-buttons"); row.append(send, partyButton(tr("やめる", "Cancel"), shut)); box.append(row); place(box, to.session);
  }
  function report(member: PartyHero, event: QuestEvent, owner: PartyHero | undefined): void {
    const text = words(member, event, "hero") ?? event.title;
    const box = document.createElement("div"), body = node("pre", "party-report", text), row = node("div", "party-buttons");
    box.append(node("h5", "party-box-title", tr(`${nameOf(member)}（${memberBadge(member)}）の 報告 · ${ago(event.at)}`, `Report from ${nameOf(member)} (${memberBadge(member)}) · ${ago(event.at)}`)), body);
    if (owner && owner !== member && owner.canTalk && live) row.append(Object.assign(partyButton(tr(`担当（${nameOf(owner)}）に 渡す`, `Pass to the owner (${nameOf(owner)})`), () =>
      order(owner, tr(`${nameOf(member)}（${memberBadge(member)}）の報告です。これをもとに進めてください。\n\n${text}`,
        `${nameOf(member)} (${memberBadge(member)}) reported. Build on this.\n\n${text}`), tr(`担当（${nameOf(owner)}）への文 — 直してから送れる`, `Message for the owner (${nameOf(owner)}) — edit before sending`))), { className: "primary" }));
    row.append(partyButton(tr("とじる", "Close"), shut)); box.append(row); place(box, member.session);
  }
  function card(member: PartyHero, owner: PartyHero | undefined): HTMLElement {
    const info = controls?.heroInfo?.(member.session) ?? {}, item = node("article", member.writer ? "party-card writer" : "party-card"); item.dataset.session = member.session;
    const asked = latest(member, (kind) => ASKS.has(kind)), answered = latest(member, (kind) => kind === "report");
    const fresh = Boolean(answered && (!asked || answered.at >= asked.at));
    // The state answers "does this hero need me?": a new report, working, never asked, or free.
    const [kind, state] = !member.canTalk ? ["idle", tr("ターミナルのみ", "Terminal only")]
      : fresh ? ["report", tr(`報告が 届いた · ${ago(answered!.at)}`, `Report arrived · ${ago(answered!.at)}`)]
      : !member.waiting ? ["work", tr(`作業中${info.doing ? ` · ${info.doing}` : ""}`, `Working${info.doing ? ` · ${info.doing}` : ""}`)]
      : !asked ? ["idle", tr("まだ 頼んでいない", "Not asked yet")] : ["idle", tr("手が あいている", "Free")];
    const role = node("p", "party-card-role"); role.append(member.writer ? iconLabel("edit", tr("担当 · 書きかえる", "Owner · writes files")) : memberBadge(member).replace(/^手伝い · |^Helper · /, ""));
    item.append(role, node("p", "party-card-model", info.gear ?? tr("モデル 不明", "Model unknown")), node("p", "party-card-name", nameOf(member)), node("p", `party-state ${kind}`, state));
    const askedText = asked && words(member, asked, "you"), answer = answered && (words(member, answered, "hero") ?? answered.title);
    if (askedText) item.append(node("p", "party-card-line", tr(`頼んだ：${firstLine(askedText)}`, `Asked: ${firstLine(askedText)}`)));
    if (answer) item.append(node("p", "party-card-line", tr(`報告：${firstLine(answer)}`, `Report: ${firstLine(answer)}`)));
    const buttons = node("div", "party-buttons"), canOrder = member.canTalk && live;
    const look = answered && partyButton(tr("報告を 見る", "Read the report"), () => report(member, answered, owner));
    const tell = canOrder ? partyButton(tr("指示する", "Order"), () => order(member)) : undefined;
    // The likely next step comes first and stands out.
    const first = fresh ? look : tell;
    if (first) { first.classList.add("primary"); buttons.append(first); }
    for (const extra of [look, tell]) if (extra && extra !== first) buttons.append(extra);
    if (member.hero) buttons.append(partyButton(tr("はなす", "Talk"), () => controls?.talk(member.hero!, member.session)));
    item.append(buttons);
    return item;
  }
  const show = (members: PartyHero[]) => {
    const here = members.filter((member) => member.active).sort((a, b) => Number(b.writer) - Number(a.writer) || ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
    const owner = here.find((member) => member.writer), gone = members.length - here.length;
    grid.replaceChildren(...here.map((member) => card(member, owner)));
    if (!here.length) grid.append(node("p", "hint", tr("パーティーに 仲間はいない。", "No party members.")));
    away.textContent = gone ? tr(`町を去った仲間：${gone}人（編成の窓で確認）`, `Members who left: ${gone} (see the party window)`) : "";
  };
  if (controls?.mock) show(controls.mock);
  else void partyRequest(`${prefix}/party`).then(show).catch(() => show([]));
  return root;
}
