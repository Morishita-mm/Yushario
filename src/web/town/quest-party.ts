import { PARTY_ROLES, roleIntroduction, roleLabel, type PartyMember, type PartyRole } from "../../core/party";
import type { QuestDetail } from "../../core/quests";
import type { Session } from "../terminal";
import { language, tr } from "../language";
import { questHandoff } from "./quest-handoff";
import type { AgentInfo } from "../rpg/agents";
import "./quest-party.css";

export type PartyHero = PartyMember & { name: string; active: boolean; canTalk?: boolean; waiting?: boolean; sessionInfo?: Session };
export type PartyControls = { talk: (hero: string, session: string) => void; review: (hero: string, session: string) => void; embark: () => void; mock?: PartyHero[] };
const drafts = new Map<string, string>();
const token = new URLSearchParams(location.search).get("token") ?? "";
export async function partyRequest(path: string, method = "GET", body?: unknown): Promise<any> {
  const response = await fetch(`/api/${path}?token=${encodeURIComponent(token)}`, { method, cache: "no-store",
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
export function questParty(quest: QuestDetail, controls?: PartyControls): HTMLElement {
  const root = document.createElement("section"); root.className = "quest-party";
  const heading = document.createElement("h4"); heading.textContent = tr("パーティー", "Party"); root.append(heading);
  const content = document.createElement("div"), status = document.createElement("p"); status.setAttribute("role", "status"); root.append(content, status);
  const prefix = `quests/${encodeURIComponent(quest.id)}`;
  const mock = controls?.mock;
  let members: PartyHero[] = mock ?? [], sessions: Session[] = [], agents: AgentInfo[] = [];
  const run = (action: () => Promise<unknown>) => { void action().catch((error: Error) => { status.textContent = error.message; }); };
  async function save(session: string, role: PartyRole, note: string, writer?: boolean): Promise<void> {
    root.dataset.dirty = "true";
    if (mock) {
      if (writer) members.forEach((member) => { member.writer = false; });
      if (role === "command") members.forEach((member) => { if (member.role === "command") member.role = "research"; });
      const member = members.find((item) => item.session === session);
      if (member) Object.assign(member, { role, note, writer });
    } else members = await partyRequest(`${prefix}/party`, "POST", { session, role, note, writer });
    render(); introduce(members.find((item) => item.session === session)!);
  }
  function introduce(member: PartyHero): void {
    if (!member || !member.canTalk) return;
    root.dataset.dirty = "true";
    const old = content.querySelector(".party-introduction"); old?.remove();
    const box = document.createElement("div"); box.className = "party-introduction";
    const draft = document.createElement("textarea"); draft.rows = 6; draft.maxLength = 8000;
    const key = `${quest.id}:intro:${member.session}`;
    draft.value = drafts.get(key) ?? roleIntroduction(member, language);
    draft.oninput = () => { drafts.set(key, draft.value); root.dataset.dirty = "true"; };
    box.append(partyField(tr("やくわりの 紹介文 · 下書き", "Role introduction · Draft"), draft),
      partyButton(tr("▶ これを つたえる", "▶ Send this"), () => run(async () => {
        if (!mock) await partyRequest(`${prefix}/send`, "POST", { session: member.session, text: draft.value });
        drafts.delete(key); root.dataset.dirty = ""; box.remove(); status.textContent = tr("つたえた！", "Sent!");
      })), partyButton(tr("▶ 送らない", "▶ Don't send"), () => { box.remove(); root.dataset.dirty = ""; }));
    content.append(box);
  }
  function render(): void {
    content.replaceChildren();
    if (!members.length) { const empty = document.createElement("p"); empty.textContent = tr("まだ だれも", "No heroes yet"); content.append(empty); }
    for (const member of members) {
      const row = document.createElement("article"); row.className = "party-member";
      const name = document.createElement("strong"); name.textContent = member.name;
      const info = document.createElement("p"); info.textContent = `${roleLabel(member.role, language)}${member.writer ? tr(" · かきかえる役", " · Writer") : ""} · ${!member.canTalk ? tr("ターミナルのみ", "Terminal only") : member.active ? member.waiting === undefined ? tr("出陣中", "Active") : member.waiting ? tr("まっている", "Ready") : tr("さぎょう中", "Working") : tr("たびだった", "Departed")}`;
      const base = document.createElement("p"); base.className = "hint"; base.textContent = member.sessionInfo ? `⑂ ${member.sessionInfo.branch ?? "HEAD"} — ${member.sessionInfo.cwd}` : "—";
      row.append(name, info, base);
      if (controls) {
        const talk = partyButton(tr("▶ はなす", "▶ Talk"), () => controls.talk(member.hero ?? member.session, member.session));
        talk.disabled = !member.active || !member.canTalk;
        row.append(talk, partyButton(tr("▶ かんてい", "▶ Review"), () => controls.review(member.hero ?? member.session, member.session)));
      }
      if (member.active) {
        const intro = partyButton(tr("▶ 紹介文", "▶ Introduction"), () => introduce(member)); intro.disabled = !member.canTalk;
        row.append(partyButton(tr("▶ やくわり", "▶ Role"), () => edit(member)), intro);
      }
      content.append(row);
    }
    const add = document.createElement("details"), title = document.createElement("summary"); title.textContent = tr("▶ 仲間を たす", "▶ Add a hero"); add.append(title);
    const select = document.createElement("select");
    for (const session of sessions.filter((item) => item.project === quest.town && !item.exited && !members.some((member) => member.session === item.id))) {
      const canTalk = agents.some((agent) => agent.id === session.preset && agent.hero);
      const option = new Option(`${session.preset} · ${session.id} · ${session.branch ?? "HEAD"}${canTalk ? "" : tr(" · ターミナルのみ", " · Terminal only")}`, session.id);
      option.disabled = !canTalk; select.append(option);
    }
    const role = roles("implement"), note = document.createElement("input"); note.maxLength = 200;
    add.append(partyField(tr("いまいる 勇者", "Hero in town"), select), partyField(tr("やくわり", "Role"), role), partyField(tr("ひとこと", "Note"), note),
      partyButton(tr("▶ パーティーに いれる", "▶ Join party"), () => run(() => save(select.value, role.value as PartyRole, note.value))));
    if (controls) add.append(partyButton(tr("▶ あたらしく 出陣", "▶ Embark a new hero"), controls.embark));
    content.append(add, questHandoff(quest, members, sessions, controls, status, agents));
  }
  function roles(chosen: PartyRole): HTMLSelectElement {
    const select = document.createElement("select"); for (const role of PARTY_ROLES) select.append(new Option(roleLabel(role, language), role)); select.value = chosen; return select;
  }
  function edit(member: PartyHero): void {
    root.dataset.dirty = "true";
    content.querySelector(".party-role-editor")?.remove();
    const form = document.createElement("div"); form.className = "party-role-editor";
    const role = roles(member.role), note = document.createElement("input"), writer = document.createElement("input"); note.maxLength = 200; note.value = member.note; writer.type = "checkbox"; writer.checked = member.writer;
    form.append(partyField(tr("やくわり", "Role"), role), partyField(tr("ひとこと", "Note"), note), partyField(tr("かきかえる役", "Writing role"), writer),
      partyButton(tr("▶ この やくわりに する", "▶ Set this role"), () => run(() => save(member.session, role.value as PartyRole, note.value, writer.checked)))); content.append(form);
  }
  if (mock) render();
  else void Promise.all([partyRequest(`${prefix}/party`), partyRequest("sessions"), partyRequest("agents")]).then(([party, list, kinds]: [PartyHero[], Session[], AgentInfo[]]) => { members = party; sessions = list; agents = kinds; render(); }).catch((error: Error) => { status.textContent = error.message; });
  return root;
}
