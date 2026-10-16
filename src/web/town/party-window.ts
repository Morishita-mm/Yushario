import { roleIntroduction, roleLabel, type PartyRole } from "../../core/party";
import { summaryRequest } from "../../core/party-scroll";
import { questStage } from "../../core/quest-stage";
import type { QuestDetail } from "../../core/quests";
import type { Session } from "../terminal";
import type { AgentInfo } from "../rpg/agents";
import { language, tr } from "../language";
import { partyRequest, type PartyControls, type PartyHero } from "./quest-party";
import "./party-window.css";
import { tacticBox } from "./party-tactics";
import { iconLabel } from "../icons.js";
import { command, el, heroCard, memberBadge, memberState } from "./party-cards";
import { formingOf, partyMode, setOff } from "./party-forming";

// A Dragon Quest style formation window: the party, heroes in town, members who left, a command window
// for the chosen hero, and a message window that walks through each step. How it sends depends on the
// quest's stage (party-forming.ts): form first and set off together, or ask at once while work runs.
const HELP_ROLES: PartyRole[] = ["research", "review"];

// `request`: the request text from the new quest window. `focus`: a hero just launched from this window.
export function openPartyWindow(quest: QuestDetail, controls: PartyControls | undefined, changed: () => void, request?: string, focus?: string): void {
  document.querySelector("#party-window")?.remove();
  const mode = partyMode(questStage(quest)), forming = formingOf(quest.id), gathering = mode === "form" || mode === "redo";
  if (request !== undefined && forming.request === undefined) forming.request = request;
  const dialog = el("dialog", "party-window"); dialog.id = "party-window";
  const title = el("h3", undefined, tr(`パーティー へんせい — ${quest.title}`, `Party — ${quest.title}`)); title.id = "party-window-title";
  dialog.setAttribute("aria-labelledby", title.id);
  // Closing returns to the quest card, so it is redrawn. Moving on to another window must not
  // redraw the card: a late redraw would reopen it on top of that window.
  const exit = () => { dialog.close(); dialog.remove(); };
  const close = () => { exit(); changed(); };
  const head = el("div", "pw-head"); head.append(title, command(tr("とじる", "Close"), close));
  const party = el("section", "pw-box"), town = el("section", "pw-box"), commands = el("section", "pw-commands"), message = el("section", "pw-message");
  const away = el("section", "pw-box pw-away"), columns = el("div", "pw-rows"); columns.append(party, town, away);
  const tacticSlot = el("div"), setting = gathering ? el("section", "pw-box pw-request") : undefined, draft = el("textarea");
  // Commands and confirmations open as a small window in front, like a command window in an RPG;
  // the standing hint stays one line under the title.
  const guideLine = el("p", "pw-guide"), popup = el("dialog", "pw-popup"), panel = el("section", "pw-box pw-popup-panel");
  panel.append(commands, message, command(tr("とじる", "Close"), () => guide()));
  // A modal dialog of its own: Tab stays inside it, the party window behind cannot be pressed, and closing it
  // returns focus to where it was opened from.
  popup.append(panel);
  // Named after what it shows: the chosen hero for commands, else the first line of the message.
  const openPopup = (name: string) => { popup.setAttribute("aria-label", name.slice(0, 80)); if (!popup.open) popup.showModal(); }, shutPopup = () => { if (popup.open) popup.close(); };
  popup.addEventListener("click", (event) => { if (event.target === popup) guide(); });
  popup.addEventListener("cancel", (event) => { event.preventDefault(); guide(); });
  dialog.append(head, guideLine, tacticSlot, columns, ...(setting ? [setting] : []), popup); document.body.append(dialog);
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  dialog.addEventListener("keydown", (event) => event.stopPropagation());
  const prefix = `quests/${encodeURIComponent(quest.id)}`, mock = controls?.mock;
  let members: PartyHero[] = mock ?? [], sessions: Session[] = [], agents: AgentInfo[] = [];
  let roster: { sessionId: string; name?: string; preset?: string; weapon?: string; accessory?: string }[] = [];
  const owner = () => members.find((member) => member.writer);
  const canTalk = (session: Session) => mock ? true : agents.some((agent) => agent.id === session.preset && agent.hero);
  // The town's own name first; a hero walking in is named by its folder; never a raw session id.
  const baseName = (session: string) => {
    const folder = sessions.find((item) => item.id === session)?.cwd.split(/[\\/]/).filter(Boolean).pop();
    const name = controls?.sessionName?.(session) ?? members.find((member) => member.session === session && member.name !== session)?.name ?? folder;
    return name && name !== session ? name : tr("去った勇者", "A hero who left");
  };
  const presetOf = (session: string) => members.find((member) => member.session === session)?.sessionInfo?.preset ?? sessions.find((item) => item.id === session)?.preset;
  const nameOf = (session: string) => {
    const name = baseName(session), presets = new Set([...members.map((member) => member.session), ...sessions.map((item) => item.id)].filter((other) => baseName(other) === name).map(presetOf));
    return presets.size > 1 && presetOf(session) ? `${name}（${presetOf(session)}）` : name;
  };
  const showMessage = (...nodes: HTMLElement[]) => { message.replaceChildren(...nodes); openPopup(commands.hidden ? nodes[0]?.textContent ?? "" : popup.getAttribute("aria-label") ?? ""); };
  const say = (text: string, ...extra: HTMLElement[]) => { commands.hidden = true; showMessage(el("p", undefined, text), ...extra); };
  // A note under the commands just shown; unlike say, it keeps the commands.
  const explain = (text: string) => showMessage(el("p", undefined, text));
  // A hint that must not cover the window (where to pick a hero, what a tactic does) goes on the hint line.
  const hint = (text: string) => { guideLine.textContent = text; };
  const fail = (error: Error) => say(error.message);
  const guide = () => {
    if (mode === "view") { shutPopup(); guideLine.replaceChildren(tr("採用した・中止した クエストの パーティーは 見るだけ。やり直すなら 新しい クエストを 作る。", "An adopted or dropped quest's party is shown only. To try again, write a new quest.")); return; }
    const text = el("p");
    text.append(tr("勇者を えらんでね。", "Choose a hero. "), iconLabel("edit", tr("担当", "The owner")), tr("は ファイルを 書きかえる ただ1人。手伝いは 書きかえずに 報告する。", " is the only one who changes files. Helpers report without changing files."),
      gathering ? tr("決め終わるまで、誰にも 何も 送らない。", " Nothing is sent to anyone until you set off.") : tr("いま 頼むと、その場で 届く。", " Asking now sends at once."));
    guideLine.replaceChildren(text); shutPopup();
  };
  const tactics = tacticBox(quest.id, Boolean(mock), command, (text) => hint(text), () => void reload().catch(fail));
  if (mode !== "view") tacticSlot.replaceWith(tactics.root);
  async function reload(): Promise<void> {
    if (mock) { render(); return; }
    [members, sessions, agents, roster] = await Promise.all([partyRequest(`${prefix}/party`), partyRequest("sessions"), partyRequest("agents"), partyRequest("roster").catch(() => [])]);
    await tactics.load(); render();
  }
  const card = (session: string, preset: string | undefined, badge: string, writer: boolean, state: string, pick: () => void, small = false) => heroCard({ session, name: nameOf(session), preset, badge, writer, state,
    info: controls?.heroInfo?.(session) ?? {}, notes: [...(tactics.outside().has(session) ? [tr("作戦の外", "Outside the tactic")] : []), ...(gathering && forming.asks.has(session) ? [tr("出発待ち", "Waiting to set off")] : [])] }, pick, small);
  function render(): void {
    commands.hidden = true; if (!message.childElementCount) shutPopup();
    const slots = el("div", "pw-cards"), present = members.filter((member) => member.active), gone = members.filter((member) => !member.active);
    for (const member of present) {
      const here = controls?.heroInfo?.(member.session).here ?? true;
      slots.append(card(member.session, member.sessionInfo?.preset, memberBadge(member), member.writer,
        here ? memberState(member) : tr("まだ 町に 来ていない（ターミナルで 最初の 依頼を 待っている）", "Not in town yet (waiting for its first request in the terminal)"), () => chooseMember(member)));
    }
    if (mode !== "view") {
      // With nobody free in town this launches a new hero; otherwise it shows where to pick one.
      const add = command("", () => {
        const first = town.querySelector<HTMLButtonElement>(".pw-card:not(.pw-add)");
        if (!first) { town.querySelector<HTMLButtonElement>(".pw-add")?.click(); return; }
        town.scrollIntoView({ block: "nearest", behavior: "smooth" }); town.classList.remove("pw-flash"); void town.offsetWidth; town.classList.add("pw-flash");
        first.focus({ preventScroll: true });
        hint(tr("「町に いる 勇者」から 仲間に する 勇者を えらぼう。いなければ「新しく 出陣させる」。", "Pick a hero from Heroes in town, or embark a new one."));
      });
      add.classList.add("pw-card", "pw-add"); add.append(el("span", "pw-plus", "＋"), el("span", undefined, tr("仲間を 足す", "Add a hero"))); slots.append(add);
    }
    party.replaceChildren(el("h4", undefined, tr(`いまの パーティー（${present.length}）`, `The party (${present.length})`)), slots);
    // Departed members: folded by default, one line each (name, model and effort), below everyone who is here.
    const fold = el("details", "pw-away-fold"); fold.open = away.dataset.open === "true";
    fold.addEventListener("toggle", () => { away.dataset.open = String(fold.open); });
    fold.append(el("summary", undefined, tr(`町を 去った 仲間（${gone.length}）`, `Party members who left (${gone.length})`)), ...gone.map(goneRow));
    away.hidden = !gone.length; away.replaceChildren(fold);
    const free = sessions.filter((session) => session.project === quest.town && !session.exited && !members.some((member) => member.session === session.id)), row = el("div", "pw-cards small");
    for (const session of free) {
      const walking = controls?.heroInfo?.(session.id).here === false;
      row.append(card(session.id, session.preset, !canTalk(session) ? tr("ターミナルのみ", "Terminal only") : walking ? tr("町に 向かっている", "Walking into town") : tr("町に いる", "In town"), false, "", () => chooseTownHero(session), true));
    }
    if (controls && mode !== "view") {
      const embark = command("", () => { exit(); controls.embark(() => openPartyWindow(quest, controls, changed), (session) => openPartyWindow(quest, controls, changed, undefined, session.id)); });
      embark.classList.add("pw-card", "small", "pw-add"); embark.append(el("span", "pw-plus", "＋"), el("span", undefined, tr("新しく 出陣させる", "Embark a new hero"))); row.append(embark);
    }
    town.replaceChildren(el("h4", undefined, tr("町に いる 勇者", "Heroes in town")), row);
    if (!free.length) town.append(el("p", "pw-empty", tr("ほかに いない", "No one else")));
  }
  function showCommands(heading: string | HTMLElement, ...buttons: HTMLButtonElement[]): void {
    const title = el("h4"); title.append(heading);
    commands.hidden = false; message.replaceChildren(); openPopup(title.textContent ?? "");
    commands.replaceChildren(title, ...buttons);
    buttons[0]?.focus();
  }
  function goneRow(member: PartyHero): HTMLButtonElement {
    const entry = roster.find((item) => item.sessionId === member.hero), gear = entry ? controls?.savedGear?.(entry.preset, entry) : controls?.heroInfo?.(member.session).gear;
    const row = command(`${entry?.name ?? nameOf(member.session)} · ${gear ?? tr("モデル・考える量 不明", "Model and effort unknown")}`, () => chooseGone(member, entry));
    row.classList.add("pw-gone-row"); return row;
  }
  function chooseGone(member: PartyHero, entry: { sessionId: string; name?: string } | undefined): void {
    if (mode === "view") return;
    const name = entry?.name ?? nameOf(member.session), buttons = [command(tr("パーティーから 外す", "Remove from the party"), () => leave(member))];
    if (entry) buttons.unshift(command(tr("よびもどす", "Recall"), () => {
      if (!mock) void partyRequest(`roster/${encodeURIComponent(entry.sessionId)}/recall`, "POST").then(reload)
        .then(() => say(tr(`${name}を よびもどした。町に 着くと 元の 役（${memberBadge(member)}）で パーティーに 戻る。`, `Recalled ${name}. It rejoins as ${memberBadge(member)} when it reaches town.`))).catch(fail);
    }, true));
    showCommands(name, ...buttons);
    explain(entry ? tr("よびもどすと、前の 会話の 続きから 再開して、元の 役で パーティーに 戻る。", "Recalling resumes its last conversation and it rejoins in its old role.")
      : tr("この 勇者は よびもどせない（めいぼに ない。話しかける 前に 去ったか、続きから 再開できない CLI）。", "This hero cannot be recalled (not in the roster: it left before any request, or its CLI cannot resume)."));
  }
  function chooseMember(member: PartyHero): void {
    const hero = member.hero ?? member.session, buttons = [
      command(tr("はなす", "Talk"), () => { exit(); controls?.talk(hero, member.session); }),
      command(tr("変更を見る", "Look at changes"), () => { exit(); controls?.review(hero, member.session); }),
    ];
    if (mode !== "view") {
      if (!member.writer && member.active && member.canTalk) buttons.push(command(owner()?.active ? tr("担当を 交代する", "Make the owner") : tr("担当にする", "Make the owner"), () => swap(member.session)));
      if (member.active) buttons.push(command(member.role === "command" ? tr("しき役を やめる", "Stop commanding") : tr("しき役に する", "Make commander"), () => commander(member)));
      buttons.push(command(tr("パーティーから 外す", "Remove from the party"), () => leave(member)));
    }
    const heading = tr(`${nameOf(member.session)}（${memberBadge(member)} · ${memberState(member)}）`, `${nameOf(member.session)} (${memberBadge(member)} · ${memberState(member)})`);
    showCommands(member.writer ? iconLabel("edit", heading) : heading, ...buttons);
  }
  function chooseTownHero(session: Session): void {
    if (mode === "view") return;
    if (!canTalk(session)) { say(tr("この勇者は ターミナルだけで、会話で 頼めない。", "This hero is terminal-only and cannot take requests by talk.")); return; }
    if (!owner()?.active) {
      showCommands(nameOf(session.id), command(tr("担当にする", "Make the owner"), () => {
        if (!mock) void partyRequest(`${prefix}/assign`, "POST", { session: session.id }).then(reload).then(guide).catch(fail);
      }, true), command(tr("手伝ってもらう", "Ask for help"), () => help(session.id)));
      explain(tr("まだ 担当が いない。担当にする：この勇者が 依頼を 受ける（まだ 何も 送らない）。", "No owner yet. Make the owner: this hero takes the request (nothing is sent yet)."));
      return;
    }
    showCommands(nameOf(session.id), command(tr("手伝ってもらう", "Ask for help"), () => help(session.id), true), command(tr("担当を 交代する", "Make the owner"), () => swap(session.id)));
  }
  // Ask for help: what to ask and the message. While forming it waits for the set-off; while work runs it goes now.
  function help(session: string): void {
    let role: PartyRole = forming.asks.get(session)?.role ?? "research", edited = forming.asks.has(session);
    const chips = el("div", "pw-chips"), text = el("textarea"), tip = el("p", "pw-tip"); text.setAttribute("aria-label", tr(`${nameOf(session)}への 頼む文`, `Message for ${nameOf(session)}`)); text.rows = 6; text.maxLength = 8000;
    // Helpers cannot pass their report to the owner themselves; the research-first tactic does it.
    const showTip = () => { tip.hidden = role !== "research" || tactics.current()?.tactic === "research";
      tip.textContent = tr("調べた 結果を 担当に 渡したい 時は、作戦を「調べてから」に する。報告が そろうと Yushario が 担当に 届ける。", "To hand the findings to the owner, choose the Research first tactic: Yushario passes the reports on."); };
    const draftText = () => `${roleIntroduction({ role, note: "", writer: false }, language)}\n\n${tr("頼みたいこと：", "What I need:")}`;
    text.value = forming.asks.get(session)?.text ?? draftText(); text.oninput = () => { edited = true; };
    for (const value of HELP_ROLES) {
      const chip = command(roleLabel(value, language), () => {
        role = value; chips.querySelectorAll("button").forEach((item) => item.setAttribute("aria-pressed", String(item === chip)));
        if (!edited) text.value = draftText();
        showTip();
      }); chip.setAttribute("aria-pressed", String(value === role)); chips.append(chip);
    }
    const send = command(gathering ? tr(`▶ ${nameOf(session)}に 頼む（出発の 時に 送る）`, `▶ Ask ${nameOf(session)} (sent when you set off)`) : tr(`▶ ${nameOf(session)}に いま 頼む`, `▶ Ask ${nameOf(session)} now`), () => void (async () => {
      if (!text.value.trim()) { text.focus(); return; }
      send.disabled = true;
      if (mock) { say(tr("（見本）頼んだ", "(Sample) Asked")); return; }
      await partyRequest(`${prefix}/party`, "POST", { session, role, note: "", writer: false });
      if (gathering) { forming.asks.set(session, { role, text: text.value }); await reload(); say(tr(`${nameOf(session)}は 出発待ち。出発の 時に 頼みごとが 届く。`, `${nameOf(session)} waits to set off; the ask goes out then.`)); return; }
      const result = await partyRequest(`${prefix}/send`, "POST", { session, text: text.value });
      await reload();
      say(result.delivered ? tr(`${nameOf(session)}に 頼んだ。`, `Asked ${nameOf(session)}.`) : tr(`${nameOf(session)}は 作業中。手が あいたら 届く。`, `${nameOf(session)} is busy; it will arrive when the hero is free.`));
    })().catch((error: Error) => { send.disabled = false; fail(error); }), true);
    commands.hidden = true;
    showTip();
    showMessage(el("p", "pw-step", tr("1 何を 頼む？", "1 What should they do?")), chips, tip, el("p", "pw-step", tr("2 伝える文（送る前に 直せる）", "2 The message (edit before sending)")), text, send);
    text.focus();
  }
  // Change the owner. While forming nothing is sent: the new owner gets the handoff note with the request at set-off.
  function swap(session: string): void {
    const previous = owner(), stays = previous && previous.session !== session && previous.active && previous.canTalk;
    let farewell = false;
    const choice: HTMLElement[] = [];
    if (stays) {
      const keep = el("label"), go = el("label"), a = el("input"), b = el("input");
      a.type = b.type = "radio"; a.name = b.name = "pw-previous"; a.checked = true; a.onchange = () => { farewell = false; }; b.onchange = () => { farewell = true; };
      keep.append(a, document.createTextNode(tr(" そのまま 残す（手伝いに なる）", " Keep (becomes a helper)"))); go.append(b, document.createTextNode(tr(" みおくる（町を 去る）", " See off (leaves town)")));
      choice.push(el("p", "pw-step", tr(`前の担当（${nameOf(previous!.session)}）は？`, `What about ${nameOf(previous!.session)}?`)), keep, go);
      if (!previous!.waiting) choice.push(el("p", "pw-warn", tr(`${nameOf(previous!.session)}は いま 作業中。交代しても 自動では 止まらない。`, `${nameOf(previous!.session)} is working now and will not stop by itself.`)));
    }
    if (gathering) {
      const yes = command(tr(`▶ ${nameOf(session)}を 担当にする（出発の 時に 引き継ぎメモを 付けて 送る）`, `▶ Make ${nameOf(session)} the owner (the handoff note goes with the request)`), () => void (async () => {
        if (mock) return;
        await partyRequest(`${prefix}/party`, "POST", { session, role: "implement", note: "", writer: true });
        if (stays) await partyRequest(`${prefix}/party`, "POST", { session: previous!.session, role: "research", note: previous!.note, writer: false });
        if (previous) forming.ownerChanged = true;
        if (farewell && previous?.hero) controls?.farewell?.(previous.hero);
        await reload(); guide();
      })().catch(fail), true);
      commands.hidden = true; showMessage(...choice, yes); return;
    }
    const text = el("textarea"); text.rows = 9; text.maxLength = 8000; text.setAttribute("aria-label", tr(`${nameOf(session)}への 引き継ぎメモ`, `Handoff note for ${nameOf(session)}`));
    if (!mock) void partyRequest(`${prefix}/scroll`).then((scroll) => { if (!text.value) text.value = scroll.text; }).catch(fail);
    const parts: HTMLElement[] = [el("p", "pw-step", tr(`引き継ぎメモ（巻物）— ${nameOf(session)}に 送る`, `Handoff note (scroll) for ${nameOf(session)}`)), text];
    if (stays) {
      const ask = command(tr(`${nameOf(previous!.session)}に まとめを 書いてもらう`, `Ask ${nameOf(previous!.session)} for a summary`), () => {
        if (!mock) void partyRequest(`${prefix}/summary`, "POST", { text: summaryRequest(language) }).then(() => { ask.textContent = tr("頼んだ。届いたら となりの ボタンで 入れる", "Asked. Insert it when it arrives"); }).catch(fail);
      });
      const insert = command(tr("届いた まとめを 入れる", "Insert the summary"), () => {
        if (!mock) void partyRequest(`${prefix}/scroll`).then((scroll) => { if (scroll.reply) text.value += `\n\n${scroll.reply}`; else insert.textContent = tr("まだ 届いていない", "Not arrived yet"); }).catch(fail);
      });
      const row = el("div", "pw-row"); row.append(ask, insert); parts.push(row, ...choice);
    }
    const send = command(tr("▶ 交代して メモを送る", "▶ Change owner and send the note"), () => void (async () => {
      if (!text.value.trim()) { text.focus(); return; }
      send.disabled = true;
      if (mock) return;
      const result = await partyRequest(`${prefix}/handoff`, "POST", { session, text: text.value, writer: true });
      if (farewell && previous?.hero) controls?.farewell?.(previous.hero);
      await reload();
      say(result.delivered ? tr(`${nameOf(session)}が 新しい担当。メモを 届けた。`, `${nameOf(session)} is the new owner. Note delivered.`) : tr(`${nameOf(session)}が 新しい担当。手が あいたら メモが 届く。`, `${nameOf(session)} is the new owner. The note arrives when the hero is free.`));
    })().catch((error: Error) => { send.disabled = false; fail(error); }), true);
    commands.hidden = true; showMessage(...parts, send); text.focus();
  }
  function commander(member: PartyHero): void {
    const becoming = member.role !== "command", current = members.find((item) => item.role === "command" && item !== member);
    const yes = command(becoming ? tr(`▶ ${nameOf(member.session)}を しき役に する`, `▶ Make ${nameOf(member.session)} commander`) : tr("▶ しき役を やめる", "▶ Stop commanding"), () => {
      if (!mock) void partyRequest(`${prefix}/party`, "POST", { session: member.session, role: becoming ? "command" : member.writer ? "implement" : "research", note: member.note, writer: member.writer }).then(reload).then(guide).catch(fail);
    }, true);
    commands.hidden = true;
    say(tr(`しき役は 1人だけ。勇者の 端末で yushario quest を使い、仲間に 依頼を 送れる。新しい 仲間や 役の 変更は 伝令で あなたが「はい」を 押すまで 待つ。採用は できない。${current ? `いまの しき役（${nameOf(current.session)}）は 調べる役に もどる。` : ""}`,
      `There is one commander. It sends requests to the party with yushario quest. New heroes and role changes wait for your yes at the herald. It cannot adopt.${current ? ` The current commander (${nameOf(current.session)}) becomes a researcher.` : ""}`), yes);
  }
  function leave(member: PartyHero): void {
    const yes = command(tr(`▶ ${nameOf(member.session)}を 外す`, `▶ Remove ${nameOf(member.session)}`), () => {
      forming.asks.delete(member.session);
      if (!mock) void partyRequest(`${prefix}/party?session=${encodeURIComponent(member.session)}`, "DELETE").then(reload).then(guide).catch(fail);
    }, true);
    commands.hidden = true;
    say(member.writer ? tr(`${nameOf(member.session)}は 担当。外すと 担当なしに なる。勇者そのものは 町に 残る。`, `${nameOf(member.session)} is the owner. The quest will have no owner. The hero stays in town.`)
      : tr(`${nameOf(member.session)}を パーティーから 外す。勇者そのものは 町に 残る。`, `Remove ${nameOf(member.session)} from the party. The hero stays in town.`), yes);
  }
  // Forming first, setting off last: everyone gets their part at once.
  if (setting) {
    draft.rows = 4; draft.maxLength = 8000; draft.value = forming.request ?? (mode === "form" ? quest.purpose || quest.title : "");
    draft.placeholder = mode === "redo" ? tr("やり直しの 指示を 書く", "Write what to do this time") : "";
    draft.oninput = () => { forming.request = draft.value; };
    const go = command(mode === "redo" ? tr("▶ 編成を終えて やり直す", "▶ Done forming — try again") : tr("▶ 編成を終えて 出発する", "▶ Done forming — set off"), () => void (async () => {
      if (!draft.value.trim()) { draft.focus(); return; }
      if (mock) { say(tr("（見本）出発した", "(Sample) Set off")); return; }
      await setOff(quest.id, draft.value.trim(), tactics.current()?.tactic, members); close();
    })().catch(fail), true);
    go.classList.add("pw-send");
    const requestTitle = el("h4", undefined, mode === "redo" ? tr("やり直しの 指示（編成が 終わったら 送る）", "What to do this time (sent when the party is ready)") : tr("依頼（編成が 終わったら 送る）", "Request (sent when the party is ready)")); requestTitle.id = "pw-request-title"; draft.setAttribute("aria-labelledby", requestTitle.id);
    setting.append(requestTitle, draft, go);
  }
  dialog.showModal(); guide();
  void reload().then(() => { const arrived = sessions.find((session) => session.id === focus); if (arrived) chooseTownHero(arrived); }).catch(fail);
}
