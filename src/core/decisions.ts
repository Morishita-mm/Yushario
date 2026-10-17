import type { CheckMark } from "./checks";
import { validReviewBranch, type ReviewMode } from "./review-base";
import type { Language } from "./town-ledger";

// What a person decided about a reviewed or accepted base (docs/PLATFORM.md stage 21).
// The server fills in the base's state; the person only chooses the verdict, reason and PR link.
export type Verdict = "approved" | "changes";
export type QuestDecision = {
  verdict?: Verdict; mode?: ReviewMode; base?: string; changes?: string;
  reason?: string; pr?: string; checks?: { name: string; mark: CheckMark }[];
  // The adopted answer. Kept even when conversation bodies are not saved: the person chose to adopt it.
  answer?: string;
  // The party tactic the person chose (stage 24).
  tactic?: import("./tactics").Tactic;
};
export type FixLine = { path: string; line: number; text: string };

export function validVerdict(input: unknown): { verdict: Verdict; mode: ReviewMode; base?: string } | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return;
  const value = input as Record<string, unknown>;
  if (!Object.keys(value).every((key) => ["verdict", "mode", "base"].includes(key))) return;
  if (value.verdict !== "approved" && value.verdict !== "changes") return;
  if (value.mode !== "uncommitted" && value.mode !== "branch") return;
  if (value.base !== undefined && (value.mode !== "branch" || !validReviewBranch(value.base))) return;
  return { verdict: value.verdict, mode: value.mode, ...(value.base !== undefined ? { base: value.base } : {}) };
}

export function validAdoption(input: unknown): { reason?: string; pr?: string } | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return;
  const value = input as Record<string, unknown>;
  if (!Object.keys(value).every((key) => key === "reason" || key === "pr")) return;
  if (value.reason !== undefined && typeof value.reason !== "string" || value.pr !== undefined && typeof value.pr !== "string") return;
  const reason = (value.reason as string | undefined)?.trim(), pr = (value.pr as string | undefined)?.trim();
  if (reason && reason.length > 500 || pr && (pr.length > 500 || !httpsUrl(pr))) return;
  return { ...(reason ? { reason } : {}), ...(pr ? { pr } : {}) };
}
function httpsUrl(value: string): boolean {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

// The draft names the exact place and what it was compared with; the person edits and sends it.
export function fixRequest(lines: FixLine[], context: { mode: ReviewMode; base?: string; head?: string }, language: Language): string {
  const en = language === "en";
  const compared = context.mode === "branch"
    ? en ? `whole branch against ${context.base ?? "its base"}` : `${context.base ?? "比べる元"} との ブランチ全体`
    : en ? "uncommitted changes" : "未コミットの変更";
  const places = [...lines].sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line)
    .map((line) => `- ${line.path}:${line.line}  ${line.text.trim()}`);
  return [
    en ? `Please fix these places (reviewed ${compared}, HEAD ${context.head || "unknown"}):` : `次の箇所を修正してください（${compared}を鑑定。HEAD ${context.head || "不明"}）：`,
    ...places,
    en ? "What to change:" : "修正する内容：",
  ].join("\n");
}
