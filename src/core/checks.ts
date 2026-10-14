import { commandActivity } from "./activity";
import type { AgentEvent } from "./events";

export type WorkFingerprint = { head: string; changes: string };
export type CheckEvidence = { command: string; passed: boolean; at: number; hero?: string; session: string; fingerprint?: WorkFingerprint; checks: string[] };
export type QuestCheck = { id: string; name: string; command: string; evidence?: CheckEvidence };
export type CheckMark = "unrun" | "passed" | "failed" | "stale";
export type CheckCandidate = { name: string; command: string };

export function sameFingerprint(a?: WorkFingerprint, b?: WorkFingerprint): boolean {
  return Boolean(a && b && a.head === b.head && a.changes === b.changes);
}
export function checkMark(evidence: CheckEvidence | undefined, current: WorkFingerprint | undefined): CheckMark {
  if (!evidence) return "unrun";
  if (!evidence.passed) return "failed";
  // Unknown states never earn a pass. The UI also shows "State unknown".
  return sameFingerprint(evidence.fingerprint, current) ? "passed" : "stale";
}
export function latestCheckEvidence(check: string, evidence: CheckEvidence[]): CheckEvidence | undefined {
  return evidence.filter((item) => item.checks.includes(check)).reduce<CheckEvidence | undefined>((last, item) =>
    !last || item.at >= last.at ? item : last, undefined);
}
const normalized = (command: string) => command.trim().replace(/\s+/g, " ");
export function commandMatchesCheck(command: string, shape: string): boolean {
  const needle = normalized(shape);
  return Boolean(needle && normalized(command).includes(needle));
}
export function checkCommand(event: AgentEvent): string | undefined {
  if (!["PostToolUse", "PostToolUseFailure"].includes(event.hook ?? "") || event.tool !== "Bash") return;
  return event.command ?? event.target;
}
export function evidenceChecks(event: AgentEvent, checks: QuestCheck[]): string[] | undefined {
  const command = checkCommand(event);
  if (!command) return;
  const matches = checks.filter((check) => commandMatchesCheck(command, check.command)).map((check) => check.id);
  const test = command.split(/&&|\|\||;|\||\n/).some((part) => commandActivity(part.trim().replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)+/, "")) === "test");
  return matches.length || test ? matches : undefined;
}
export function checkCandidates(input: unknown): CheckCandidate[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  const scripts = (input as Record<string, unknown>).scripts;
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) return [];
  return ["test", "typecheck", "lint", "build"].filter((name) => typeof (scripts as Record<string, unknown>)[name] === "string")
    .map((name) => ({ name, command: name === "test" ? "npm test" : `npm run ${name}` }));
}
export function validQuestCheck(input: unknown): input is CheckCandidate {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>;
  return Object.keys(value).every((key) => key === "name" || key === "command")
    && typeof value.name === "string" && value.name.trim().length > 0 && value.name.length <= 80
    && typeof value.command === "string" && value.command.trim().length > 0 && value.command.length <= 200;
}
