import { finishedQuest, QUEST_STATES, type QuestDetail, type QuestState } from "../../core/quests";
import { previousHero, questRound, questStage, stepIndex, QUEST_STEPS, type QuestStage } from "../../core/quest-stage";
import type { CheckCandidate } from "../../core/checks";
import { tr } from "../language";
import { questStateLabel } from "./quest-list";
import { acceptedView, eventRow, ownerReport } from "./quest-events";
import { questChecks, confirmChecksDone, checksRequest } from "./quest-checks";
import { checkMarks } from "./check-marks";
import { questParty, type PartyControls } from "./quest-party";
import type { TacticStatus } from "../../core/tactics";
import { tacticProgress } from "./party-tactics";
import { iconLabel } from "../icons.js";

export type QuestPatch = { title?: string; purpose?: string; state?: QuestState; adoption?: { reason: string; pr: string } };
export type TownHero = { session: string; name: string; busy: boolean };
// Everything the card can do; the app and the mock supply their own.
export type QuestCardActions = {
  heroName: (hero?: string) => string;
  ownerHere?: boolean;
  save: (patch: QuestPatch) => Promise<void>;
  remove: () => Promise<void>;
  talk: (hero: string, at?: number) => void;
  focusHero: () => void;
  townHeroes: () => TownHero[];
  assign?: (session: string) => Promise<void>;
  send?: (text: string, checks: CheckCandidate[]) => Promise<boolean>;
  terminal?: () => void;
  embark?: () => void;
  fold?: () => Promise<void>;
  preview?: HTMLElement;
  party?: PartyControls;
  review?: () => void;
  reload?: () => void;
  // The party tactic (stage 24): its status, stopping it, and starting "Research first".
  tactic?: TacticStatus;
  stopTactic?: () => Promise<void>;
  research?: (text: string) => Promise<void>;
};
const STEP_NAMES: Record<typeof QUEST_STEPS[number], () => string> = {
  write: () => tr("依頼", "Request"), assign: () => tr("任せる", "Assign"), send: () => tr("指示", "Send"),
  work: () => tr("作業", "Work"), review: () => tr("報告を見る", "Review"), accept: () => tr("採用する", "Adopt"),
};
const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node;
};
const button = (text: string | HTMLElement, run: () => void, primary = false): HTMLButtonElement => {
  const node = element("button", primary ? "primary" : undefined); node.append(text); node.type = "button"; node.onclick = run; return node;
};

export function questCard(quest: QuestDetail, actions: QuestCardActions): HTMLElement {
  const box = element("div", "quest-card"), stage = questStage(quest, actions.ownerHere), who = actions.heroName(quest.hero) || tr("勇者", "your hero");
  const status = element("p"); status.setAttribute("role", "status");
  const edit = editForm(quest, actions, status);

  // The six steps, then the one thing to do now. Editing and history stay folded below.
  const track = element("ol", "quest-track"), at = stepIndex(stage);
  QUEST_STEPS.forEach((step, index) => track.append(element("li", index < at ? "done" : index === at ? "now" : "", `${index + 1} ${STEP_NAMES[step]()}`)));
  // Deleting is common, so it sits at the top instead of inside a fold.
  const head = element("div", "quest-card-head");
  head.append(button(iconLabel("trash", tr("クエストを消す", "Delete quest")), () => {
    if (!confirm(tr("この クエストの きろくを けす？", "Delete this quest's records?"))) return;
    void actions.remove().catch((error: Error) => { status.textContent = error.message; });
  }));
  box.append(head, track, nextMove(quest, stage, who, actions, status, edit), status, facts(quest, stage, actions));

  const editing = foldable(quest.id, "edit", tr("依頼と目的を書きかえる", "Edit the request, purpose or state"));
  editing.append(edit.form);
  if (actions.fold && quest.worktreePath) editing.append(button(tr("▶ 作業する場所を たたむ（worktree）", "▶ Fold the worktree"), () => {
    if (!confirm(tr("作業する場所（worktree）を たたむ？ branch は のこる。", "Fold this worktree? Its branch stays."))) return;
    void actions.fold!().catch((error: Error) => { status.textContent = error.message; });
  }));
  const tools = foldable(quest.id, "tools", tr("合格条件を足す・プレビューをつなぐ", "Add acceptance checks · connect a preview"));
  tools.append(questChecks(quest)); if (actions.preview) tools.append(actions.preview);
  // Who is on the quest is always visible; forming the party opens its own window.
  const team = element("section", "quest-team");
  team.append(element("h4", undefined, tr("パーティー", "Party")), questParty(quest, actions.party, () => actions.reload?.()));
  const history = foldable(quest.id, "events", tr(`これまでの出来事（${quest.events.length}）`, `Everything so far (${quest.events.length})`));
  for (const event of quest.events) history.append(eventRow(event, actions.talk));
  box.append(team, editing, tools, history);
  return box;
}

function nextMove(quest: QuestDetail, stage: QuestStage, who: string, actions: QuestCardActions, status: HTMLElement, edit: ReturnType<typeof editForm>): HTMLElement {
  const box = element("section", `quest-next ${stage === "work" ? "work" : finishedQuest(quest.state) ? "end" : "you"}`);
  const label = element("p", "quest-next-label", stage === "work" ? tr("いまの ようす", "Now") : finishedQuest(quest.state) ? tr("おわり", "Finished") : tr("次にやること", "Next"));
  const what = element("p", "quest-next-what"), row = element("div", "quest-next-actions");
  box.append(label, what);
  const talk = () => { if (quest.hero) actions.talk(quest.hero); };
  const fail = (error: Error) => { status.textContent = error.message; };
  const tactic = actions.tactic;
  // While the tactic moves the party on its own, the card says so and offers to stop it.
  if (tactic?.running) {
    box.className = "quest-next work"; label.textContent = tr("作戦で 進んでいる", "The tactic is running");
    what.textContent = tacticProgress(tactic);
    if (actions.stopTactic) row.append(button(tr("止める（命令に従え に 戻す）", "Stop (back to Follow orders)"), () => void actions.stopTactic!().catch(fail)));
    box.append(row); return box;
  }
  if (tactic?.stopped && !finishedQuest(quest.state)) box.append(element("p", "quest-tactic-stopped", tacticProgress(tactic)));
  if (stage === "assign") {
    what.textContent = tr("このクエストを 誰に任せる？", "Who should take this quest?");
    const heroes = actions.townHeroes(), list = element("div", "quest-pick");
    let chosen = heroes.find((hero) => !hero.busy)?.session ?? heroes[0]?.session;
    for (const hero of heroes) {
      const option = element("label"), radio = element("input"); radio.type = "radio"; radio.name = `assign-${quest.id}`; radio.checked = hero.session === chosen;
      radio.onchange = () => { chosen = hero.session; };
      option.append(radio, document.createTextNode(` ${hero.name}（${hero.busy ? tr("作業中", "working") : tr("手があいている", "free")}）`)); list.append(option);
    }
    if (!heroes.length) list.append(element("p", "hint", tr("この町に 勇者は いない。新しく出陣させよう。", "No hero is in this town. Embark a new one.")));
    box.append(list);
    if (heroes.length && actions.assign) row.append(button(tr("▶ 選んだ勇者に任せる", "▶ Assign the chosen hero"), () => {
      if (chosen) void actions.assign!(chosen).catch(fail);
    }, true));
    if (actions.embark) row.append(button(tr("新しく出陣させる", "Embark a new hero"), actions.embark, !heroes.length));
  } else if (stage === "send") {
    what.textContent = tr(`${who}に 指示を送ろう。まだ 何も伝わっていない。`, `Send ${who} the request. Nothing has been sent yet.`);
    const text = element("textarea"); text.rows = 4; text.maxLength = 8000; text.value = quest.purpose || quest.title;
    text.oninput = () => { box.dataset.dirty = "true"; };
    const picks = element("div", "quest-pick"), chosen = new Map<string, CheckCandidate>();
    box.append(text, picks);
    // Offer the town's script checks once; choosing none is fine.
    if (actions.send) void checksRequest(`${encodeURIComponent(quest.id)}/checks`).then((data) => {
      const known = new Set(data.checks.map((check) => check.command));
      const offered = (data.candidates ?? []).filter((candidate) => !known.has(candidate.command));
      if (offered.length) picks.append(element("p", "hint", tr("合格条件も 足す？（なくても よい）", "Add acceptance checks too? (optional)")));
      for (const candidate of offered) {
        const option = element("label"), check = element("input"); check.type = "checkbox";
        check.onchange = () => { if (check.checked) chosen.set(candidate.command, candidate); else chosen.delete(candidate.command); };
        option.append(check, document.createTextNode(` ${candidate.command}`)); picks.append(option);
      }
    }).catch(() => undefined);
    if (tactic?.tactic === "research" && actions.research) row.append(button(tr("▶ 調べる役に 送る（調べてから）", "▶ Send to the researchers (Research first)"), () => {
      void actions.research!(text.value).then(() => { delete box.dataset.dirty; status.textContent = tr("調べる役に 送った", "Sent to the researchers"); }).catch(fail);
    }, true));
    else if (actions.send) row.append(button(tr("▶ この指示を送る", "▶ Send this request"), () => {
      void actions.send!(text.value, [...chosen.values()]).then((delivered) => {
        delete box.dataset.dirty;
        status.textContent = delivered ? tr("指示を 届けた", "Request delivered") : tr("指示を あずけた。勇者の 手が あいたら 届く", "Request held. It will be delivered when the hero is free.");
      }).catch(fail);
    }, true));
    if (quest.hero) row.append(button(tr("話す窓をひらく", "Open the talk window"), talk));
  } else if (stage === "work") {
    what.textContent = tr(`${who}が 作業中。あなたの番は まだ。`, `${who} is working. Nothing for you yet.`);
    if (quest.hero) row.append(button(tr("▶ ようすを見る（話す窓）", "▶ Watch (talk window)"), talk));
    if (actions.terminal) row.append(button(tr("ターミナルを見る", "Open the terminal"), actions.terminal));
  } else if (stage === "waiting") {
    what.textContent = tr(`${who}が あなたの返事を 待っている。`, `${who} is waiting for your answer.`);
    if (quest.hero) row.append(button(tr("▶ 答えに行く（話す窓）", "▶ Answer (talk window)"), talk, true));
    if (actions.terminal) row.append(button(tr("ターミナルを見る", "Open the terminal"), actions.terminal));
  } else if (stage === "review") {
    what.textContent = tr("報告が届いた。変更を見て、採用するか決めよう。", "A report arrived. Look at the changes, then decide whether to adopt them.");
    const latest = ownerReport(quest);
    if (latest) box.append(eventRow(latest, actions.talk));
    if (quest.checks?.length) box.append(checkMarks(quest.checks, quest.fingerprint, true));
    // Adopting and asking for another try each open their own small form under the buttons.
    const accept = element("div", "quest-accept"), retry = element("div", "quest-accept"); accept.hidden = retry.hidden = true;
    const toggle = (shown: HTMLElement, other: HTMLElement, focus: HTMLElement) => { other.hidden = true; shown.hidden = !shown.hidden; if (!shown.hidden) focus.focus(); };
    if (actions.review) row.append(button(tr("▶ 変更を見る（かんてい）", "▶ Look at the changes (review)"), actions.review, true));
    if (quest.hero) row.append(button(tr("報告を受ける", "Read the report"), () => actions.talk(quest.hero!, latest?.at)));
    row.append(button(tr("採用する", "Adopt"), () => toggle(accept, retry, edit.reason)));
    edit.adoption.hidden = false;
    accept.append(edit.adoption, element("p", "hint", tr("採用すると、この回の 報告の 本文も 保存される（設定の「かいわも のこす」が 切れていても）。あとから この札で 読みかえせる。",
      "Adopting also saves this round's report text, even when conversations are not kept, so you can read it again on this card.")),
      button(tr("▶ この版を 採用する", "▶ Adopt this state"), () => void edit.accept()));
    if (actions.send) {
      const text = element("textarea"); text.rows = 3; text.maxLength = 8000;
      text.placeholder = tr("例：エラー文が まだ かたい。もっと やさしく して。", "e.g. The error text is still stiff. Make it friendlier.");
      text.oninput = () => { box.dataset.dirty = "true"; };
      row.append(button(tr("やり直してもらう", "Ask for another try"), () => toggle(retry, accept, text)));
      retry.append(element("p", "hint", tr(`${who}への 新しい指示。送ると もう一度 作業する。`, `A new request for ${who}. Sending it starts another round.`)), text,
        button(tr("▶ この指示を送る", "▶ Send this request"), () => {
          if (!text.value.trim()) { text.focus(); return; }
          void actions.send!(text.value, []).then((delivered) => {
            delete box.dataset.dirty; retry.hidden = true;
            status.textContent = delivered ? tr("指示を 届けた", "Request delivered") : tr("指示を あずけた。勇者の 手が あいたら 届く", "Request held. It will be delivered when the hero is free.");
          }).catch(fail);
        }, true));
    }
    box.append(row, accept, retry); return box;
  } else if (stage === "done") {
    what.append(iconLabel("check", tr("採用した", "Adopted")));
    const accepted = quest.events.find((event) => event.kind === "adopted");
    const report = ownerReport(quest, accepted?.at);
    if (accepted) box.append(acceptedView(accepted, report));
  } else what.textContent = tr("やめた クエスト", "Dropped quest");
  box.append(row); return box;
}

function facts(quest: QuestDetail, stage: QuestStage, actions: QuestCardActions): HTMLElement {
  const list = element("dl", "quest-facts");
  const add = (term: string, value: string | HTMLElement) => { list.append(element("dt", undefined, term)); const dd = element("dd"); dd.append(value); list.append(dd); };
  const before = previousHero(quest.events, quest.hero);
  if (actions.tactic && actions.tactic.tactic !== "obey") add(tr("さくせん", "Tactic"), tacticProgress(actions.tactic));
  const owner = element("button", undefined, before ? `${actions.heroName(before)} → ${actions.heroName(quest.hero)}` : actions.heroName(quest.hero) || tr("まだ 誰にも任せていない", "Not assigned yet"));
  owner.type = "button"; owner.disabled = !quest.hero; owner.onclick = actions.focusHero;
  add(tr("担当", "Hero"), owner);
  if (quest.worktreePath) add(tr("作業する場所", "Working folder"), iconLabel("branch", `${quest.worktreeBranch ?? "HEAD"} — ${quest.worktreePath}`));
  if (quest.purpose && stage !== "send") add(tr("目的", "Purpose"), quest.purpose);
  if (quest.checks?.length && stage !== "review") add(tr("合格条件", "Acceptance checks"), checkMarks(quest.checks, quest.fingerprint, true));
  const round = questRound(quest.events, stage);
  if (round) add(tr("何回目", "Round"), tr(`${round}回目`, `${round}`));
  return list;
}

// The full edit form. Its acceptance fields move into the review step when a report is waiting.
function editForm(quest: QuestDetail, actions: QuestCardActions, status: HTMLElement) {
  const form = element("form");
  form.oninput = form.onchange = () => { form.dataset.dirty = "true"; };
  const title = element("input"); title.value = quest.title; title.maxLength = 200; title.required = true;
  const purpose = element("textarea"); purpose.value = quest.purpose; purpose.maxLength = 2000; purpose.rows = 2;
  const state = element("select");
  for (const value of QUEST_STATES) state.append(new Option(questStateLabel(value), value)); state.value = quest.state;
  for (const [text, input] of [[tr("名前", "Name"), title], [tr("目的", "Purpose"), purpose], [tr("状態", "State"), state]] as const) {
    const label = element("label"); label.append(document.createTextNode(text), input); form.append(label);
  }
  // Accepting records which state was accepted; it is not a merge.
  const adoption = element("fieldset"), reason = element("textarea"), pr = element("input");
  reason.maxLength = 500; reason.rows = 2; pr.type = "url"; pr.maxLength = 500; pr.placeholder = "https://";
  adoption.oninput = () => { adoption.dataset.dirty = "true"; };
  adoption.append(element("legend", undefined, tr("採用の 記録（main への 取りこみ では ない）", "Adoption record (not a merge into main)")));
  for (const [text, input] of [[tr("理由（なくても よい）", "Reason (optional)"), reason], [tr("PR の URL（なくても よい）", "PR URL (optional)"), pr]] as const) {
    const label = element("label"); label.append(document.createTextNode(text), input); adoption.append(label);
  }
  const showAdoption = () => { if (form.contains(adoption)) adoption.hidden = state.value !== "done" || quest.state === "done"; };
  state.addEventListener("change", showAdoption); form.append(adoption); showAdoption();
  async function submit(accepting: boolean): Promise<void> {
    if ((accepting || state.value === "done") && !await confirmChecksDone(quest)) return;
    // Send only what the person changed, so a newer state is never overwritten by the form's copy.
    const patch: QuestPatch = {};
    if (title.value.trim() !== quest.title) patch.title = title.value.trim();
    if (purpose.value !== quest.purpose) patch.purpose = purpose.value;
    if (accepting) patch.state = "done"; else if (state.value !== quest.state) patch.state = state.value as QuestState;
    if (patch.state === "done") patch.adoption = { reason: reason.value, pr: pr.value };
    if (Object.keys(patch).length) await actions.save(patch);
    delete form.dataset.dirty; delete adoption.dataset.dirty;
    status.textContent = tr("のこした！", "Saved!");
  }
  const save = element("button", undefined, tr("▶ ほぞん", "▶ Save")); save.type = "submit"; form.append(save);
  form.onsubmit = (event) => {
    event.preventDefault(); save.disabled = true;
    void submit(false).catch((error: Error) => { status.textContent = error.message; }).finally(() => { save.disabled = false; });
  };
  return { form, adoption, reason, accept: () => submit(true).catch((error: Error) => { status.textContent = error.message; }) };
}

// Which folds a person opened survive the card being redrawn by new events.
const opened = new Map<string, Map<string, boolean>>();
function foldable(quest: string, key: string, title: string, initial = false): HTMLDetailsElement {
  const details = element("details", `quest-fold quest-fold-${key}`);
  details.append(element("summary", undefined, title));
  details.open = opened.get(quest)?.get(key) ?? initial;
  details.addEventListener("toggle", () => { const state = opened.get(quest) ?? new Map<string, boolean>(); state.set(key, details.open); opened.set(quest, state); });
  return details;
}
