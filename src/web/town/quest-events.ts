import { reportTitle, type QuestDetail, type QuestEvent, type QuestState } from "../../core/quests";
import { partyEventTitle } from "../../core/party";
import { parseMarkdown } from "../../core/markdown";
import { clock, language, tr } from "../language";
import { renderMarkdown } from "../rpg/markdown";
import { questStateLabel } from "./quest-list";
import { checkMarkLabel, evidenceView } from "./check-marks";

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node;
};
const button = (text: string, run: () => void): HTMLButtonElement => { const node = element("button", undefined, text); node.type = "button"; node.onclick = run; return node; };

// The owner's latest report; helpers' reviews and research are reports too, but not the quest's result.
export function ownerReport(quest: QuestDetail, before = Infinity): QuestEvent | undefined {
  const reports = quest.events.filter((event) => event.kind === "report" && event.at <= before);
  return reports.find((event) => event.hero === quest.hero) ?? reports[0];
}
export function eventRow(event: QuestEvent, talk: (hero: string, at?: number) => void): HTMLElement {
  const row = element("article", "quest-event");
  const headline = event.kind === "state" ? questStateLabel(event.title as QuestState)
    : event.kind === "assigned" ? tr("勇者に 任せた", "Hero assigned")
    : event.kind === "reviewed" ? tr("変更を 見た（かんてい）", "Opened the changes (review)")
    : event.kind === "verdict" ? event.decision?.verdict === "approved" ? tr("鑑定：OKと 記録", "Review: recorded as OK") : tr("鑑定：要修正と 記録", "Review: recorded as needing changes")
    : event.kind === "adopted" ? tr("採用した", "Adopted")
    : event.kind === "report" ? reportTitle(event.report, language) : partyEventTitle(event.kind, event.title, language);
  const text = `${clock(event.at, true)} · ${headline}`;
  if (event.kind === "report" && event.hero) row.append(button(text, () => talk(event.hero!, event.at)));
  else row.append(element("p", undefined, text));
  if (event.report) {
    const r = event.report, duration = Math.max(0, Math.round((r.endedAt - r.startedAt - (r.waitedMs ?? 0)) / 1000));
    row.append(element("p", undefined, `${r.files.join(", ")} · ${tr("テストの じっこう", "Test runs")} ○${r.tests.passed} ×${r.tests.failed} · ${duration}s`));
  }
  if (event.result && (event.kind === "verdict" || event.kind === "adopted" || event.kind === "report")) {
    const unknown = event.kind !== "report" && !event.decision?.changes ? tr(" · じょうたい ふめい", " · State unknown") : "";
    row.append(element("p", "hint", `${event.result.branch ?? "—"} · HEAD ${event.result.head ?? "—"}${unknown}`));
  }
  if (event.evidence) row.append(evidenceView(event.evidence));
  if (event.text) row.append(element("pre", "quest-event-body", event.text));
  return row;
}
// What was adopted, readable here without going back to the conversation.
export function acceptedView(event: QuestEvent, report?: QuestEvent): HTMLElement {
  const box = element("section", "quest-accepted");
  if (report?.report) box.append(element("p", undefined, `${reportTitle(report.report, language)} · ${report.report.files.join(", ") || "—"} · ${tr("テストの じっこう", "Test runs")} ○${report.report.tests.passed} ×${report.report.tests.failed}`));
  if (event.decision?.answer) {
    const answer = element("div", "quest-answer talk-body"); renderMarkdown(answer, parseMarkdown(event.decision.answer));
    box.append(element("h5", undefined, tr("採用した 回答", "Adopted answer")), answer);
  } else box.append(element("p", "hint", tr("この採用には 回答の本文が 残っていない（この機能より前の採用）。", "No answer text was kept for this adoption (adopted before this was saved).")));
  box.append(element("p", undefined, `${tr("採用した 版", "Adopted state")}: ${event.result?.branch ?? "—"} · HEAD ${event.result?.head ?? "—"}${event.decision?.changes ? "" : tr(" · じょうたい ふめい", " · State unknown")}`));
  const marks = event.decision?.checks ?? [];
  if (marks.length) box.append(element("p", "hint", marks.map((check) => `${check.name}: ${checkMarkLabel(check.mark)}`).join(" · ")));
  if (event.decision?.reason) box.append(element("p", undefined, event.decision.reason));
  if (event.decision?.pr) {
    const link = element("a", undefined, `PR: ${event.decision.pr}`); link.href = event.decision.pr; link.target = "_blank"; link.rel = "noopener noreferrer"; box.append(link);
  }
  box.append(element("p", "hint", tr("採用した ＝ main への 取りこみ では ない。取りこみは PR で。", "Adopted is not merged into main. Merge through your PR.")));
  return box;
}
