import { reportTitle, type QuestDetail } from "./quests";
import type { Language } from "./town-ledger";

export type ScrollCheck = { title: string; mark: string };
// Only ledger fields. No interpretation, generated decisions, or inferred next steps.
export function handoffScroll(quest: QuestDetail, checks: ScrollCheck[], language: Language): string {
  const ja = language === "ja";
  const marks: Record<string, string> = { unrun: ja ? "· みじっこう" : "· Not run", passed: ja ? "✔ ごうかく" : "✔ Passed", failed: ja ? "✖ しっぱい" : "✖ Failed", stale: ja ? "↺ ふるい" : "↺ Stale" };
  const last = quest.events.filter((event) => event.kind === "report").sort((a, b) => b.at - a.at || b.id - a.id)[0];
  const files = [...new Set(quest.events.flatMap((event) => event.report?.files ?? []))];
  return [
    `${ja ? "クエスト" : "Quest"}: ${quest.title}`,
    `${ja ? "目的" : "Purpose"}: ${quest.purpose}`,
    `${ja ? "ためすこと" : "Checks"}:\n${checks.map((check) => `${marks[check.mark] ?? check.mark} ${check.title}`).join("\n") || "—"}`,
    `${ja ? "変えたファイル" : "Changed files"}:\n${files.join("\n") || "—"}`,
    `${ja ? "拠点" : "Base"}: ${quest.worktreePath ?? "—"}\nbranch: ${quest.worktreeBranch ?? "—"}`,
    `${ja ? "最後の報告" : "Last report"}: ${last ? reportTitle(last.report, language) : "—"}`,
    ...(last?.text ? [last.text] : []),
  ].join("\n\n");
}
export function summaryRequest(language: Language): string {
  return language === "ja" ? "ひきつぎの まとめを かいてください：目的・きめたこと・のこり・注意"
    : "Please write a handoff summary: purpose, decisions, remaining work, and cautions.";
}
