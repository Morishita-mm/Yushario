import { roleIntroduction, roleLabel, type PartyRole } from "../../core/party";
import { summaryRequest } from "../../core/party-scroll";
import type { QuestDetail } from "../../core/quests";
import type { Session } from "../terminal";
import type { AgentInfo } from "../rpg/agents";
import { language, tr } from "../language";
import { partyRequest, type PartyControls, type PartyHero } from "./quest-party";
import "./party-window.css";

// A Dragon Quest style formation window: the party on the left, heroes in town on the right,
// a command window for the chosen hero, and a message window that walks through each step.
const HELP_ROLES: PartyRole[] = ["research", "review", "test"];
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node;
};
const command = (text: string, run: () => void, primary = false): HTMLButtonElement => {
  const node = el("button", primary ? "pw-command primary" : "pw-command", text); node.type = "button"; node.onclick = run; return node;
};
export const memberState = (member: PartyHero): string => !member.canTalk ? tr("ターミナルのみ", "Terminal only")
  : !member.active ? tr("去った", "Left") : member.waiting ? tr("待っている", "Ready") : tr("作業中", "Working");
export const memberBadge = (member: PartyHero): string => member.writer ? tr("担当 ✎", "Owner ✎")
  : member.role === "command" ? tr("しき", "Command") : tr(`手伝い · ${roleLabel(member.role, language)}`, `Helper · ${roleLabel(member.role, language)}`);

export function openPartyWindow(quest: QuestDetail, controls: PartyControls | undefined, changed: () => void): void {
  document.querySelector("#party-window")?.remove();
  const dialog = el("dialog", "party-window"); dialog.id = "party-window";
  const title = el("h3", undefined, tr(`パーティー へんせい — ${quest.title}`, `Party — ${quest.title}`)); title.id = "party-window-title";
  dialog.setAttribute("aria-labelledby", title.id);
  const close = () => { dialog.close(); dialog.remove(); changed(); };
  const head = el("div", "pw-head"); head.append(title, command(tr("とじる", "Close"), close));
  const party = el("section", "pw-box"), town = el("section", "pw-box"), commands = el("section", "pw-box pw-commands"), message = el("section", "pw-box pw-message");
  const columns = el("div", "pw-columns"); columns.append(party, town);
  dialog.append(head, columns, commands, message); document.body.append(dialog);
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  dialog.addEventListener("keydown", (event) => event.stopPropagation());
  const prefix = `quests/${encodeURIComponent(quest.id)}`, mock = controls?.mock;
  let members: PartyHero[] = mock ?? [], sessions: Session[] = [], agents: AgentInfo[] = [];
  const owner = () => members.find((member) => member.writer);
  const canTalk = (session: Session) => mock ? true : agents.some((agent) => agent.id === session.preset && agent.hero);
  // The town's own name for a hero first, so the same hero reads the same everywhere.
  const nameOf = (session: string) => controls?.sessionName?.(session) ?? members.find((member) => member.session === session)?.name ?? session;
  const say = (text: string, ...extra: HTMLElement[]) => { message.replaceChildren(el("p", undefined, text), ...extra); };
  const fail = (error: Error) => say(error.message);
  const guide = () => say(tr("勇者を えらんでね。担当（✎）は ファイルを 書きかえる ただ1人。手伝いは 書きかえずに 報告する。",
    "Choose a hero. The owner (✎) is the only one who changes files. Helpers report without changing files."));

  async function reload(): Promise<void> {
    if (mock) { render(); return; }
    [members, sessions, agents] = await Promise.all([partyRequest(`${prefix}/party`), partyRequest("sessions"), partyRequest("agents")]);
    render();
  }
  function render(): void {
    commands.hidden = true;
    party.replaceChildren(el("h4", undefined, tr("いまの パーティー", "The party")));
    if (!members.length) party.append(el("p", "pw-empty", tr("まだ だれも いない", "Nobody yet")));
    for (const member of members) {
      const row = command("", () => chooseMember(member)); row.classList.add("pw-hero");
      row.append(el("span", "pw-name", nameOf(member.session)), el("span", member.writer ? "pw-badge writer" : "pw-badge", memberBadge(member)), el("span", "pw-state", memberState(member)));
      party.append(row);
    }
    town.replaceChildren(el("h4", undefined, tr("町に いる 勇者", "Heroes in town")));
    const free = sessions.filter((session) => session.project === quest.town && !session.exited && !members.some((member) => member.session === session.id));
    for (const session of free) {
      const row = command("", () => chooseTownHero(session)); row.classList.add("pw-hero");
      row.append(el("span", "pw-name", nameOf(session.id)), el("span", "pw-badge", session.preset), el("span", "pw-state", canTalk(session) ? "" : tr("ターミナルのみ", "Terminal only")));
      town.append(row);
    }
    if (!free.length) town.append(el("p", "pw-empty", tr("ほかに いない", "No one else")));
    if (controls) town.append(command(tr("＋ 新しく 出陣させる", "＋ Embark a new hero"), () => { close(); controls.embark(); }));
  }
  function showCommands(heading: string, ...buttons: HTMLButtonElement[]): void {
    commands.hidden = false;
    commands.replaceChildren(el("h4", undefined, heading), ...buttons, command(tr("やめる", "Cancel"), () => { commands.hidden = true; guide(); }));
    buttons[0]?.focus();
  }
  function chooseMember(member: PartyHero): void {
    const hero = member.hero ?? member.session, buttons = [
      command(tr("はなす", "Talk"), () => { close(); controls?.talk(hero, member.session); }),
      command(tr("変更を見る", "Look at changes"), () => { close(); controls?.review(hero, member.session); }),
    ];
    if (!member.writer && member.active && member.canTalk) buttons.push(command(tr("担当を 交代する", "Make the owner"), () => swap(member.session)));
    if (member.active) buttons.push(command(member.role === "command" ? tr("しき役を やめる", "Stop commanding") : tr("しき役に する", "Make commander"), () => commander(member)));
    buttons.push(command(tr("パーティーから 外す", "Remove from the party"), () => leave(member)));
    showCommands(tr(`${nameOf(member.session)}（${memberBadge(member)} · ${memberState(member)}）`, `${nameOf(member.session)} (${memberBadge(member)} · ${memberState(member)})`), ...buttons);
    say(member.writer ? tr("担当は ファイルを 書きかえる ただ1人。交代する時は 町の勇者を えらんで「担当を 交代する」。", "The owner is the only one who changes files. To change owners, pick a hero in town and choose Make the owner.")
      : tr("手伝いは ファイルを 書きかえない。気づいたことを 報告する。", "Helpers do not change files; they report what they find."));
  }
  function chooseTownHero(session: Session): void {
    if (!canTalk(session)) { say(tr("この勇者は ターミナルだけで、会話で 頼めない。", "This hero is terminal-only and cannot take requests by talk.")); return; }
    showCommands(nameOf(session.id), command(tr("手伝ってもらう", "Ask for help"), () => help(session.id), true), command(tr("担当を 交代する", "Make the owner"), () => swap(session.id)));
    say(tr("手伝ってもらう：いまの担当は そのまま。担当を 交代する：仕事ごと この勇者に 渡す。", "Ask for help keeps the owner. Make the owner hands the whole quest to this hero."));
  }

  // Ask for help: what to ask, the message (with the role explained), then send.
  function help(session: string): void {
    let role: PartyRole = "research", edited = false;
    const chips = el("div", "pw-chips"), text = el("textarea"); text.rows = 6; text.maxLength = 8000;
    const draft = () => `${roleIntroduction({ role, note: "", writer: false }, language)}\n\n${tr("頼みたいこと：", "What I need:")}`;
    text.value = draft(); text.oninput = () => { edited = true; };
    for (const value of HELP_ROLES) {
      const chip = command(roleLabel(value, language), () => {
        role = value; chips.querySelectorAll("button").forEach((item) => item.setAttribute("aria-pressed", String(item === chip)));
        if (!edited) text.value = draft();
      }); chip.setAttribute("aria-pressed", String(value === role)); chips.append(chip);
    }
    const send = command(tr(`▶ ${nameOf(session)}に 頼む`, `▶ Ask ${nameOf(session)}`), () => void (async () => {
      if (!text.value.trim()) { text.focus(); return; }
      send.disabled = true;
      if (mock) { say(tr("（見本）頼んだ", "(Sample) Asked")); return; }
      await partyRequest(`${prefix}/party`, "POST", { session, role, note: "", writer: false });
      const result = await partyRequest(`${prefix}/send`, "POST", { session, text: text.value });
      await reload();
      say(result.delivered ? tr(`${nameOf(session)}に 頼んだ。`, `Asked ${nameOf(session)}.`) : tr(`${nameOf(session)}は 作業中。手が あいたら 届く。`, `${nameOf(session)} is busy; it will arrive when the hero is free.`));
    })().catch((error: Error) => { send.disabled = false; fail(error); }), true);
    commands.hidden = true;
    message.replaceChildren(el("p", "pw-step", tr("1 何を 頼む？", "1 What should they do?")), chips,
      el("p", "pw-step", tr("2 伝える文（送る前に 直せる）", "2 The message (edit before sending)")), text, send);
    text.focus();
  }

  // Change the owner: the handoff note, an optional summary from the old owner, what happens to them, then send.
  function swap(session: string): void {
    const previous = owner(), text = el("textarea"); text.rows = 9; text.maxLength = 8000;
    const parts: HTMLElement[] = [el("p", "pw-step", tr(`1 引き継ぎメモ（巻物）— ${nameOf(session)}に 送る`, `1 Handoff note (scroll) for ${nameOf(session)}`)), text];
    if (!mock) void partyRequest(`${prefix}/scroll`).then((scroll) => { if (!text.value) text.value = scroll.text; }).catch(fail);
    let farewell = false;
    if (previous && previous.session !== session && previous.active && previous.canTalk) {
      const ask = command(tr(`${nameOf(previous.session)}に まとめを 書いてもらう`, `Ask ${nameOf(previous.session)} for a summary`), () => {
        if (mock) return;
        void partyRequest(`${prefix}/summary`, "POST", { text: summaryRequest(language) })
          .then(() => { ask.textContent = tr("頼んだ。届いたら となりの ボタンで 入れる", "Asked. Insert it when it arrives"); }).catch(fail);
      });
      const insert = command(tr("届いた まとめを 入れる", "Insert the summary"), () => {
        if (mock) return;
        void partyRequest(`${prefix}/scroll`).then((scroll) => {
          if (scroll.reply) text.value += `\n\n${scroll.reply}`; else insert.textContent = tr("まだ 届いていない", "Not arrived yet");
        }).catch(fail);
      });
      const keep = el("label"), send_ = el("label"), stay = el("input"), go = el("input");
      stay.type = go.type = "radio"; stay.name = go.name = "pw-previous"; stay.checked = true;
      stay.onchange = () => { farewell = false; }; go.onchange = () => { farewell = true; };
      keep.append(stay, document.createTextNode(tr(` そのまま 残す（手伝いに なる）`, ` Keep (becomes a helper)`)));
      send_.append(go, document.createTextNode(tr(` みおくる（作業を 終えて 町を 去る）`, ` See off (stops and leaves town)`)));
      const row = el("div", "pw-row"); row.append(ask, insert);
      parts.push(row, el("p", "pw-step", tr(`2 前の担当（${nameOf(previous.session)}）は？`, `2 What about ${nameOf(previous.session)}?`)));
      if (!previous.waiting) parts.push(el("p", "pw-warn", tr(`${nameOf(previous.session)}は いま 作業中。交代しても 自動では 止まらない。`, `${nameOf(previous.session)} is working now and will not stop by itself.`)));
      parts.push(keep, send_);
    }
    const send = command(tr("▶ 交代して メモを送る", "▶ Change owner and send the note"), () => void (async () => {
      if (!text.value.trim()) { text.focus(); return; }
      send.disabled = true;
      if (mock) { say(tr("（見本）交代した", "(Sample) Owner changed")); return; }
      const result = await partyRequest(`${prefix}/handoff`, "POST", { session, text: text.value, writer: true });
      if (farewell && previous?.hero) controls?.farewell?.(previous.hero);
      await reload();
      say(result.delivered ? tr(`${nameOf(session)}が 新しい担当。メモを 届けた。`, `${nameOf(session)} is the new owner. Note delivered.`)
        : tr(`${nameOf(session)}が 新しい担当。作業中なので、手が あいたら メモが 届く。`, `${nameOf(session)} is the new owner. The note arrives when the hero is free.`));
    })().catch((error: Error) => { send.disabled = false; fail(error); }), true);
    commands.hidden = true;
    message.replaceChildren(...parts, send);
    text.focus();
  }

  function commander(member: PartyHero): void {
    const becoming = member.role !== "command", current = members.find((item) => item.role === "command" && item !== member);
    const yes = command(becoming ? tr(`▶ ${nameOf(member.session)}を しき役に する`, `▶ Make ${nameOf(member.session)} commander`) : tr("▶ しき役を やめる", "▶ Stop commanding"), () => {
      if (mock) { member.role = becoming ? "command" : "research"; render(); guide(); return; }
      void partyRequest(`${prefix}/party`, "POST", { session: member.session, role: becoming ? "command" : member.writer ? "implement" : "research", note: member.note, writer: member.writer })
        .then(reload).then(guide).catch(fail);
    }, true);
    commands.hidden = true;
    say(tr(`しき役は 1人だけ。しき役は 勇者の 端末で yushario quest を使い、仲間に 依頼を 送れる。新しい 仲間や 役の 変更は 伝令で あなたが「はい」を 押すまで 待つ。採用は できない。${current ? `いまの しき役（${nameOf(current.session)}）は 調べる役に もどる。` : ""}`,
      `There is one commander. It can send requests to the party with yushario quest in its terminal. New heroes and role changes wait for your yes at the herald. It cannot adopt.${current ? ` The current commander (${nameOf(current.session)}) becomes a researcher.` : ""}`), yes);
  }
  function leave(member: PartyHero): void {
    const yes = command(tr(`▶ ${nameOf(member.session)}を 外す`, `▶ Remove ${nameOf(member.session)}`), () => {
      if (mock) { members = members.filter((item) => item !== member); render(); guide(); return; }
      void partyRequest(`${prefix}/party?session=${encodeURIComponent(member.session)}`, "DELETE").then(reload).then(guide).catch(fail);
    }, true);
    commands.hidden = true;
    say(member.writer ? tr(`${nameOf(member.session)}は 担当。外すと このクエストは 担当なしに なる。勇者そのものは 町に 残る。`, `${nameOf(member.session)} is the owner. The quest will have no owner. The hero stays in town.`)
      : tr(`${nameOf(member.session)}を パーティーから 外す。勇者そのものは 町に 残る。`, `Remove ${nameOf(member.session)} from the party. The hero stays in town.`), yes);
  }

  dialog.showModal(); guide();
  void reload().catch(fail);
}
