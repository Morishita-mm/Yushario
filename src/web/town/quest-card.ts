import { reportTitle, QUEST_STATES, type QuestDetail, type QuestState } from "../../core/quests";
import { clock, language, tr } from "../language";
import { questStateLabel } from "./quest-list";
import { questChecks, confirmChecksDone } from "./quest-checks";
import { evidenceView } from "./check-marks";
import { questParty, type PartyControls } from "./quest-party";
import { partyEventTitle } from "../../core/party";
export function questCard(quest: QuestDetail, heroName: string,
  save: (patch: { title: string; purpose: string; state: QuestState }) => Promise<void>,
  focus: () => void, report: (hero: string, at: number) => void, remove: () => Promise<void>,
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
  const submit = document.createElement("button"); submit.type = "submit"; submit.textContent = tr("▶ ほぞん", "▶ Save");
  const status = document.createElement("p"); status.setAttribute("role", "status");
  form.append(submit); form.onsubmit = (event) => {
    event.preventDefault(); submit.disabled = true;
    void (async () => {
      if (state.value === "done" && !await confirmChecksDone(quest)) return;
      await save({ title: title.value.trim(), purpose: purpose.value, state: state.value as QuestState });
      delete form.dataset.dirty;
      status.textContent = tr("のこした！", "Saved!");
    })()
      .catch((error: Error) => { status.textContent = error.message; }).finally(() => { submit.disabled = false; });
  };
  box.append(form);
  const who = document.createElement("button"); who.type = "button"; who.textContent = heroName || tr("まだ だれも", "Unassigned");
  who.disabled = !heroName; who.onclick = focus; box.append(who, status);
  if (quest.worktreePath) {
    const base = document.createElement("p"); base.className = "hint"; base.textContent = `⑂ ${quest.worktreeBranch ?? "HEAD"} — ${quest.worktreePath}`; box.append(base);
  }
  if (review) {
    const button = document.createElement("button"); button.type = "button"; button.textContent = tr("▶ かんてい", "▶ Review"); button.onclick = review; box.append(button);
  }
  if (embark) {
    const button = document.createElement("button"); button.type = "button"; button.textContent = tr("▶ しゅつじん", "▶ Embark"); button.onclick = embark; box.append(button);
  }
  if (fold && quest.worktreePath) {
    const button = document.createElement("button"); button.type = "button"; button.textContent = tr("▶ 拠点を たたむ", "▶ Fold base");
    button.onclick = () => {
      if (!confirm(tr("拠点を たたむ？ branch は のこる。", "Fold this base? Its branch stays."))) return;
      button.disabled = true; void fold().catch((error: Error) => { status.textContent = error.message; button.disabled = false; });
    }; box.append(button);
  }
  box.append(questChecks(quest));
  if (preview) box.append(preview);
  box.append(questParty(quest, party));
  const heading = document.createElement("h4"); heading.textContent = tr("できごと", "Events"); box.append(heading);
  for (const event of quest.events) {
    const row = document.createElement("article"); row.className = "quest-event";
    const headline = event.kind === "state" ? questStateLabel(event.title as QuestState)
      : event.kind === "assigned" ? tr("勇者が ついた", "Hero assigned")
      : event.kind === "reviewed" ? tr("かんてい ずみ", "Reviewed")
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
    if (event.kind === "report" && event.result) {
      const result = document.createElement("p"); result.className = "hint";
      result.textContent = `${event.result.branch ?? "—"} · HEAD ${event.result.head ?? "—"}`; row.append(result);
    }
    if (event.evidence) row.append(evidenceView(event.evidence));
    if (event.text) { const body = document.createElement("pre"); body.className = "quest-event-body"; body.textContent = event.text; row.append(body); }
    box.append(row);
  }
  const del = document.createElement("button"); del.type = "button"; del.textContent = tr("▶ この クエストを けす", "▶ Delete this quest");
  del.onclick = () => {
    if (!confirm(tr("この クエストの きろくを けす？", "Delete this quest's records?"))) return;
    del.disabled = true; void remove().catch((error: Error) => { status.textContent = error.message; del.disabled = false; });
  };
  box.append(del); return box;
}
