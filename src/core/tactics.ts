import type { PartyRole } from "./party";
import type { Language } from "./town-ledger";

// Party tactics (docs/PLATFORM.md stage 24): how party members hand work to each other.
// Only "obey" sends nothing on its own. Adopting is always the person's decision.
export const TACTICS = ["obey", "review", "research", "delegate"] as const;
export type Tactic = typeof TACTICS[number];
export const HELPER_LIMIT = 3;
export const REVIEW_ROUNDS = 3;

export type TacticMember = { session: string; role: PartyRole; writer: boolean; active: boolean; cwd?: string; joinedAt: number };
export type TacticGap = "owner" | "reviewer" | "same-folder" | "researcher" | "commander" | "separate-commander";
export type TacticFit = { ok: boolean; gaps: TacticGap[]; inside: string[]; outside: string[] };
// The tactic, whether the party fits it, and how far an automatic run has got.
export type TacticStatus = { tactic: Tactic; fit: TacticFit; fits: Record<Tactic, TacticFit>; running: boolean; round: number; waiting: number; total: number; stopped?: string; done?: boolean };

export const validTactic = (value: unknown): value is Tactic => TACTICS.includes(value as Tactic);
export function tacticLabel(tactic: Tactic, language: Language): string {
  const ja = language === "ja";
  return { obey: ja ? "命令に従え" : "Follow orders", review: ja ? "レビューし合え" : "Review each other",
    research: ja ? "調べてから" : "Research first", delegate: ja ? "全部任せた" : "Leave it all" }[tactic];
}

// Who takes part, and what is missing. Helpers beyond the limit, or with another role, stay outside the tactic.
export function tacticFit(tactic: Tactic, members: readonly TacticMember[]): TacticFit {
  const active = members.filter((member) => member.active).sort((a, b) => a.joinedAt - b.joinedAt);
  const owner = active.find((member) => member.writer);
  const helpers = active.filter((member) => member !== owner);
  const fit = (gaps: TacticGap[], inside: TacticMember[]): TacticFit => ({
    ok: gaps.length === 0, gaps, inside: inside.map((member) => member.session),
    outside: helpers.filter((member) => !inside.includes(member)).map((member) => member.session),
  });
  if (tactic === "obey") return fit([], []);
  const gaps: TacticGap[] = owner ? [] : ["owner"];
  if (tactic === "review") {
    const reviewers = helpers.filter((member) => member.role === "review");
    const together = reviewers.filter((member) => owner && member.cwd !== undefined && member.cwd === owner.cwd).slice(0, HELPER_LIMIT);
    if (!reviewers.length) gaps.push("reviewer"); else if (!together.length) gaps.push("same-folder");
    return fit(gaps, together);
  }
  if (tactic === "research") {
    const researchers = helpers.filter((member) => member.role === "research").slice(0, HELPER_LIMIT);
    if (!researchers.length) gaps.push("researcher");
    return fit(gaps, researchers);
  }
  const commander = active.find((member) => member.role === "command");
  if (!commander) gaps.push("commander"); else if (commander === owner) gaps.push("separate-commander");
  const others = helpers.filter((member) => member !== commander).slice(0, HELPER_LIMIT);
  return fit(gaps, commander && commander !== owner ? [commander, ...others] : others);
}

export type Verdict = "ok" | "changes";
// The reviewer is asked to end with "判定：OK" or "判定：要修正" (or "Verdict: OK / Changes").
// Anything else is not guessed: the run stops and returns to the person.
export function parseVerdict(text: string): Verdict | undefined {
  const last = text.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean).pop() ?? "";
  const match = /^[*_`]*(?:判定|verdict)\s*[:：]\s*(ok|要修正|changes)[*_`。.]*$/i.exec(last);
  if (!match) return;
  return match[1].toLowerCase() === "ok" ? "ok" : "changes";
}
export function withoutVerdict(text: string): string {
  const lines = text.trim().split(/\r?\n/);
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (lines.length && parseVerdict(lines[lines.length - 1])) lines.pop();
  return lines.join("\n").trim();
}

// `note`: what the person asked of this reviewer while forming; it goes before the verdict instruction, which stays last.
export function reviewRequest(quest: { title: string; purpose: string; folder?: string }, report: string | undefined, round: number, language: Language, note?: string): string {
  const ja = language === "ja";
  return [
    ja ? `【作戦：レビューし合え · ${round}回目】担当の 変更を レビューしてください。ファイルは 書きかえないでください。` : `[Tactic: review each other · round ${round}] Please review the owner's changes. Do not change any files.`,
    `${ja ? "クエスト" : "Quest"}: ${quest.title}`,
    ...(quest.purpose ? [`${ja ? "目的" : "Purpose"}: ${quest.purpose}`] : []),
    ja ? `変更の 見かた: ${quest.folder ?? "担当の 作業フォルダ"} の git diff と、新しい ファイルを 読む。` : `How to see the changes: read git diff and new files in ${quest.folder ?? "the owner's folder"}.`,
    ...(report ? [`${ja ? "担当の 報告" : "Owner's report"}:\n${report}`] : []),
    ...(note ? [`${ja ? "あなたへの 頼みごと" : "What I asked of you"}:\n${note}`] : []),
    ja ? "直してほしい 点が あれば、場所（ファイル:行）と 理由を 書いてください。\n最後の 行に「判定：OK」か「判定：要修正」の どちらか だけを 書いてください。"
      : "If anything should change, give the place (file:line) and why.\nOn the last line write only \"Verdict: OK\" or \"Verdict: Changes\".",
  ].join("\n\n");
}
export function fixRequest(findings: readonly { name: string; text: string }[], round: number, language: Language): string {
  const ja = language === "ja";
  return [
    ja ? `【作戦：レビューし合え · ${round}回目】レビュー役から 直してほしい 点が 届きました。直して、終わったら 報告してください。` : `[Tactic: review each other · round ${round}] The reviewers asked for changes. Please fix them and report when done.`,
    ...findings.map((finding) => `■ ${finding.name}\n${withoutVerdict(finding.text) || (ja ? "（理由の 書かれていない 要修正）" : "(Changes requested without details)")}`),
  ].join("\n\n");
}

export function researchRequest(request: string, note: string, language: Language): string {
  const ja = language === "ja";
  return [
    ja ? "【作戦：調べてから】担当が 作業を 始める 前に、次の 依頼に ついて 調べて、分かった ことを 報告してください。ファイルは 書きかえないでください。"
      : "[Tactic: research first] Before the owner starts, research the request below and report what you find. Do not change any files.",
    ...(note ? [`${ja ? "見てほしい 観点" : "Focus"}: ${note}`] : []),
    `${ja ? "依頼" : "Request"}:\n${request}`,
  ].join("\n\n");
}
export function researchedRequest(request: string, reports: readonly { name: string; text: string }[], language: Language): string {
  const ja = language === "ja";
  return [request, ja ? "--- 調べる役の 報告 ---" : "--- Research reports ---", ...reports.map((report) => `■ ${report.name}\n${report.text.trim()}`)].join("\n\n");
}
export function relayToCommander(name: string, report: string, language: Language): string {
  return language === "ja" ? `【作戦：全部任せた】${name}から 報告が 届きました。\n\n${report.trim()}` : `[Tactic: leave it all] ${name} reported:\n\n${report.trim()}`;
}
