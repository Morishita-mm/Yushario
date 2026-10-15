import { finishedQuest, reportTitle, QUEST_STATES, type QuestDetail, type QuestEvent, type QuestState } from "../../core/quests";
import { clock, language, tr } from "../language";
import { questStateLabel, questStateMark } from "./quest-list";
import { questChecks, confirmChecksDone } from "./quest-checks";
import { checkMarkLabel, checkMarks, evidenceView } from "./check-marks";
import { questParty, type PartyControls } from "./quest-party";
import { partyEventTitle } from "../../core/party";
export function questCard(quest: QuestDetail, heroName: string,
  save: (patch: { title?: string; purpose?: string; state?: QuestState; adoption?: { reason: string; pr: string } }) => Promise<void>,
  focus: () => void, report: (hero: string, at?: number) => void, remove: () => Promise<void>,
  embark?: () => void, fold?: () => Promise<void>, preview?: HTMLElement, party?: PartyControls, review?: () => void): HTMLElement {
  const box = document.createElement("div"); box.className = "quest-card";
  const form = document.createElement("form");
  form.oninput = form.onchange = () => { form.dataset.dirty = "true"; };
  const title = document.createElement("input"); title.value = quest.title; title.maxLength = 200; title.required = true;
  const purpose = document.createElement("textarea"); purpose.value = quest.purpose; purpose.maxLength = 2000; purpose.rows = 2;
  const state = document.createElement("select");
  for (const value of QUEST_STATES) state.append(new Option(questStateLabel(value), value)); state.value = quest.state;
  for (const [text, input] of [[tr("題", "Title"), title], [tr("目的", "Purpose"), purpose], [tr("状態", "State"), state]] as const) {
    const label = document.createElement("label"); label.append(document.createTextNode(text), input); form.append(label);
  }
  // Choosing "done" records which state was accepted; it is not a merge.
  const adoption = document.createElement("fieldset"), reason = document.createElement("textarea"), pr = document.createElement("input");
  reason.maxLength = 500; reason.rows = 2; pr.type = "url"; pr.maxLength = 500; pr.placeholder = "https://";
  const legend = document.createElement("legend"); legend.textContent = tr("うけとる 記録（main への とりこみ では ない）", "Acceptance record (not a merge into main)");
  adoption.append(legend);
  for (const [text, input] of [[tr("理由（なくても よい）", "Reason (optional)"), reason], [tr("PR の URL（なくても よい）", "PR URL (optional)"), pr]] as const) {
    const label = document.createElement("label"); label.append(document.createTextNode(text), input); adoption.append(label);
  }
  const showAdoption = () => { adoption.hidden = state.value !== "done" || quest.state === "done"; };
  state.addEventListener("change", showAdoption); showAdoption(); form.append(adoption);
  const submit = document.createElement("button"); submit.type = "submit"; submit.textContent = tr("▶ ほぞん", "▶ Save");
  const status = document.createElement("p"); status.setAttribute("role", "status");
  form.append(submit); form.onsubmit = (event) => {
    event.preventDefault(); submit.disabled = true;
    void (async () => {
      if (state.value === "done" && !await confirmChecksDone(quest)) return;
      // Send only what the person changed, so a newer state is never overwritten by the form's copy.
      const patch: { title?: string; purpose?: string; state?: QuestState; adoption?: { reason: string; pr: string } } = {};
      if (title.value.trim() !== quest.title) patch.title = title.value.trim();
      if (purpose.value !== quest.purpose) patch.purpose = purpose.value;
      if (state.value !== quest.state) patch.state = state.value as QuestState;
      if (patch.state === "done") patch.adoption = { reason: reason.value, pr: pr.value };
      if (Object.keys(patch).length) await save(patch);
      delete form.dataset.dirty;
      status.textContent = tr("のこした！", "Saved!");
    })()
      .catch((error: Error) => { status.textContent = error.message; }).finally(() => { submit.disabled = false; });
  };
  // The card opens on what is happening and the next move; editing and history stay folded.
  const summary = document.createElement("section"); summary.className = "quest-summary";
  const headline = document.createElement("p"); headline.className = "quest-state";
  headline.textContent = `${questStateMark(quest.state)} ${questStateLabel(quest.state)} · ${nextMove(quest)}`;
  summary.append(headline);
  if (quest.purpose) { const line = document.createElement("p"); line.className = "quest-purpose"; line.textContent = quest.purpose; summary.append(line); }
  const owner = document.createElement("p"); owner.className = "quest-owner";
  const who = document.createElement("button"); who.type = "button"; who.textContent = heroName || tr("まだ だれも", "Unassigned");
  who.disabled = !heroName; who.onclick = focus; owner.append(who);
  if (quest.worktreePath) { const base = document.createElement("span"); base.className = "hint"; base.textContent = ` ⑂ ${quest.worktreeBranch ?? "HEAD"} — ${quest.worktreePath}`; owner.append(base); }
  summary.append(owner);
  if (quest.checks?.length) summary.append(checkMarks(quest.checks, quest.fingerprint, true));
  const actions = document.createElement("div"); actions.className = "quest-actions";
  const action = (text: string, run: () => void) => { const button = document.createElement("button"); button.type = "button"; button.textContent = text; button.onclick = run; actions.append(button); };
  if (review) action(tr("▶ かんてい", "▶ Review"), review);
  if (quest.hero) action(tr("▶ はなす", "▶ Talk"), () => report(quest.hero!));
  if (!finishedQuest(quest.state)) action(tr("▶ 採る", "▶ Accept"), () => {
    edit.open = true; state.value = "done"; state.dispatchEvent(new Event("change", { bubbles: true })); reason.focus();
  });
  if (embark) action(tr("▶ しゅつじん", "▶ Embark"), embark);
  summary.append(actions);
  const accepted = quest.events.find((event) => event.kind === "adopted"), latest = quest.events.find((event) => event.kind === "report");
  if (accepted) summary.append(acceptedView(accepted));
  else if (latest) summary.append(eventRow(latest, report));
  box.append(summary, status);

  const edit = foldable(quest.id, "edit", tr("へんしゅう（題・目的・状態・けす）", "Edit (title, purpose, state, delete)"));
  edit.append(form);
  if (fold && quest.worktreePath) {
    const button = document.createElement("button"); button.type = "button"; button.textContent = tr("▶ 拠点を たたむ", "▶ Fold base");
    button.onclick = () => {
      if (!confirm(tr("拠点を たたむ？ branch は のこる。", "Fold this base? Its branch stays."))) return;
      button.disabled = true; void fold().catch((error: Error) => { status.textContent = error.message; button.disabled = false; });
    }; edit.append(button);
  }
  const del = document.createElement("button"); del.type = "button"; del.textContent = tr("▶ この クエストを けす", "▶ Delete this quest");
  del.onclick = () => {
    if (!confirm(tr("この クエストの きろくを けす？", "Delete this quest's records?"))) return;
    del.disabled = true; void remove().catch((error: Error) => { status.textContent = error.message; del.disabled = false; });
  };
  edit.append(del);
  const tools = foldable(quest.id, "tools", tr("ためすこと・プレビューを ふやす", "Add checks and previews"));
  tools.append(questChecks(quest)); if (preview) tools.append(preview);
  // A party of one stays folded; once others joined or a scroll was passed, it starts open.
  const together = quest.events.some((event) => event.kind === "party" || event.kind === "handoff");
  const team = foldable(quest.id, "party", tr("パーティーと ひきつぎ", "Party and handoff"), together);
  team.append(questParty(quest, party));
  const history = foldable(quest.id, "events", tr(`できごと（${quest.events.length}）`, `Events (${quest.events.length})`));
  for (const event of quest.events) history.append(eventRow(event, report));
  box.append(edit, tools, team, history);
  return box;
}
// Which folds a person opened survive the card being redrawn by new events.
const opened = new Map<string, Map<string, boolean>>();
function foldable(quest: string, key: string, title: string, initial = false): HTMLDetailsElement {
  const details = document.createElement("details"); details.className = `quest-fold quest-fold-${key}`;
  const summary = document.createElement("summary"); summary.textContent = title; details.append(summary);
  details.open = opened.get(quest)?.get(key) ?? initial;
  details.addEventListener("toggle", () => { const state = opened.get(quest) ?? new Map<string, boolean>(); state.set(key, details.open); opened.set(quest, state); });
  return details;
}
function nextMove(quest: QuestDetail): string {
  return ({
    open: quest.hero ? tr("勇者に たのもう", "Ask your hero") : tr("勇者を つけるか しゅつじん", "Assign or embark a hero"),
    active: tr("勇者が さぎょう中", "Your hero is working"),
    waiting: tr("勇者が あなたの へんじを まっている", "Your hero is waiting for you"),
    review: tr("成果を かんていしよう", "Review the result"),
    done: tr("うけとった", "Accepted"),
    dropped: tr("やめた", "Dropped"),
  } as const)[quest.state];
}
function eventRow(event: QuestEvent, report: (hero: string, at?: number) => void): HTMLElement {
  const row = document.createElement("article"); row.className = "quest-event";
  const headline = event.kind === "state" ? questStateLabel(event.title as QuestState)
    : event.kind === "assigned" ? tr("勇者が ついた", "Hero assigned")
    : event.kind === "reviewed" ? tr("かんていを ひらいた", "Opened review")
    : event.kind === "verdict" ? event.decision?.verdict === "approved" ? tr("鑑定：みとめた", "Review: approved") : tr("鑑定：なおしが いる", "Review: changes needed")
    : event.kind === "adopted" ? tr("うけとった", "Accepted")
    : event.kind === "report" ? reportTitle(event.report, language) : partyEventTitle(event.kind, event.title, language);
  const text = `${clock(event.at, true)} · ${headline}`;
  if (event.kind === "report" && event.hero) {
    const button = document.createElement("button"); button.type = "button"; button.textContent = text; button.onclick = () => report(event.hero!, event.at); row.append(button);
  } else { const label = document.createElement("p"); label.textContent = text; row.append(label); }
  if (event.report) {
    const summary = document.createElement("p");
    const r = event.report, duration = Math.max(0, Math.round((r.endedAt - r.startedAt - (r.waitedMs ?? 0)) / 1000));
    summary.textContent = `${r.files.join(", ")} · ${tr("テストの じっこう", "Test runs")} ○${r.tests.passed} ×${r.tests.failed} · ${duration}s`;
    row.append(summary);
  }
  if ((event.kind === "verdict" || event.kind === "adopted") && event.result) {
    const result = document.createElement("p"); result.className = "hint";
    result.textContent = `${event.result.branch ?? "—"} · HEAD ${event.result.head ?? "—"}${event.decision?.changes ? "" : tr(" · じょうたい ふめい", " · State unknown")}`; row.append(result);
  }
  if (event.kind === "report" && event.result) {
    const result = document.createElement("p"); result.className = "hint";
    result.textContent = `${event.result.branch ?? "—"} · HEAD ${event.result.head ?? "—"}`; row.append(result);
  }
  if (event.evidence) row.append(evidenceView(event.evidence));
  if (event.text) { const body = document.createElement("pre"); body.className = "quest-event-body"; body.textContent = event.text; row.append(body); }
  return row;
}
function acceptedView(event: QuestEvent): HTMLElement {
  const box = document.createElement("section"); box.className = "quest-accepted";
  const head = document.createElement("p");
  head.textContent = `✓ ${tr("うけとった 版", "Accepted state")}: ${event.result?.branch ?? "—"} · HEAD ${event.result?.head ?? "—"}${event.decision?.changes ? "" : tr(" · じょうたい ふめい", " · State unknown")}`;
  box.append(head);
  const marks = event.decision?.checks ?? [];
  if (marks.length) { const line = document.createElement("p"); line.className = "hint"; line.textContent = marks.map((check) => `${check.name}: ${checkMarkLabel(check.mark)}`).join(" · "); box.append(line); }
  if (event.decision?.reason) { const line = document.createElement("p"); line.textContent = event.decision.reason; box.append(line); }
  if (event.decision?.pr) {
    const link = document.createElement("a"); link.href = event.decision.pr; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = `PR: ${event.decision.pr}`; box.append(link);
  }
  const note = document.createElement("p"); note.className = "hint"; note.textContent = tr("採った ＝ main への とりこみ では ない", "Accepted is not merged into main"); box.append(note);
  return box;
}
