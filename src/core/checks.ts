import { commandActivity } from "./activity";
import type { AgentEvent } from "./events";

export type WorkFingerprint = { head: string; changes: string; base?: string };
export type CheckEvidence = { command: string; passed?: boolean; at: number; hero?: string; session: string; base?: string; fingerprint?: WorkFingerprint; checks: string[] };
export type QuestCheck = { id: string; name: string; command: string; evidence?: CheckEvidence };
export type CheckMark = "unrun" | "passed" | "failed" | "stale" | "unknown";
export type CheckCandidate = { name: string; command: string };

export function sameFingerprint(a?: WorkFingerprint, b?: WorkFingerprint): boolean {
  return Boolean(a?.base && b?.base && a.base === b.base && a.head === b.head && a.changes === b.changes);
}
export function checkMark(evidence: CheckEvidence | undefined, current: WorkFingerprint | undefined): CheckMark {
  if (!evidence) return "unrun";
  if (evidence.passed === undefined) return "unknown";
  if (!evidence.passed) return "failed";
  // Unknown states never earn a pass. The UI also shows "State unknown".
  return evidence.base === current?.base && sameFingerprint(evidence.fingerprint, current) ? "passed" : "stale";
}
export function latestCheckEvidence(check: string, evidence: CheckEvidence[]): CheckEvidence | undefined {
  return evidence.filter((item) => item.checks.includes(check)).reduce<CheckEvidence | undefined>((last, item) =>
    !last || item.at >= last.at ? item : last, undefined);
}
export function checkBasePath(quest: { town: string; worktreePath?: string }, writer: string | undefined,
  sessions: { id: string; cwd: string; project: string; exited?: unknown }[]): string | undefined {
  return quest.worktreePath ?? sessions.find((session) => session.id === writer && session.project === quest.town && !session.exited)?.cwd;
}
// A deliberately small recognizer, not a shell parser. Unsafe syntax can only
// identify an UNKNOWN attempt; it never certifies either success or failure.
function commandWords(command: string): { parts: string[][]; certain: boolean } {
  const parts: string[][] = [], words: string[] = [];
  let word = "", quote = "", started = false, certain = true, afterAnd = false;
  const finishWord = () => { if (started) words.push(word); word = ""; started = false; };
  const finishPart = () => { finishWord(); if (words.length) parts.push(words.splice(0)); };
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (quote) {
      if (quote === '"' && "$`\\".includes(char)) certain = false;
      if (char === quote) quote = ""; else word += char;
      continue;
    }
    if (char === "'" || char === '"') { quote = char; started = true; afterAnd = false; continue; }
    if (char === "#" && !started) {
      while (i < command.length && command[i] !== "\n") i++;
      if (i < command.length) certain = false;
      finishPart(); continue;
    }
    if (char === "&" && command[i + 1] === "&") {
      finishWord(); if (!words.length) certain = false;
      finishPart(); afterAnd = true; i++; continue;
    }
    if (";&|\n\r(){}<>$`\\".includes(char)) { certain = false; finishPart(); continue; }
    if (/\s/.test(char)) { finishWord(); continue; }
    word += char; started = true; afterAnd = false;
  }
  if (quote || afterAnd) certain = false;
  finishPart();
  for (const part of parts) {
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(part[0] ?? "")) part.shift();
    // exit/exec and friends can end the shell with status 0 before a later `&& npm test` runs.
    if (part.some((word) => /^(exit|exec|return|logout|kill|trap|eval|source|\.|set|shopt|alias|builtin|command)$/.test(word))) certain = false;
    if (!part.length || /^(if|then|else|elif|fi|for|while|until|do|done|case|esac|function|select|!|time)$/.test(part[0])) {
      certain = false;
      part.shift(); // May identify an unknown attempt, never infer a branch ran.
    }
  }
  return { parts, certain: certain && parts.length > 0 };
}
function matches(words: string[], needle: string[]): boolean {
  return needle.length > 0 && needle.every((word, index) => words[index] === word);
}
export function certainCheckCommand(command: string): boolean { return commandWords(command).certain; }
export function commandMatchesCheck(command: string, shape: string): boolean {
  const needle = commandWords(shape), parsed = commandWords(command);
  return needle.certain && needle.parts.length === 1 && parsed.certain
    && parsed.parts.some((words) => matches(words, needle.parts[0]));
}
export function checkCommand(event: AgentEvent): string | undefined {
  // Codex 0.162.1 documents tool output, not a structured exit status.
  if (event.source === "codex") return;
  if (!["PostToolUse", "PostToolUseFailure"].includes(event.hook ?? "") || event.tool !== "Bash") return;
  return event.command ?? event.target;
}
export function evidenceChecks(event: AgentEvent, checks: QuestCheck[]): string[] | undefined {
  const command = checkCommand(event);
  if (!command) return;
  const parsed = commandWords(command);
  const ids = checks.filter((check) => {
    const needle = commandWords(check.command);
    return needle.certain && needle.parts.length === 1 && parsed.parts.some((words) => matches(words, needle.parts[0]));
  }).map((check) => check.id);
  const test = parsed.parts.some((words) => commandActivity(words.join(" ")) === "test");
  return ids.length || test ? ids : undefined;
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
