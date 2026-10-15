import { gitBuffer as git } from "./git";
import { createHash } from "node:crypto";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import { join, relative } from "node:path";
import { checkBasePath, checkCandidates, checkCommand, evidenceChecks, type WorkFingerprint } from "../core/checks";
import { safeReviewPath } from "../core/review";
import { truncateEventString, type AgentEvent } from "../core/events";
import type { QuestLedger } from "./quest-ledger";
import type { TerminalSession } from "./pty-session";

const LIMIT = 1024 * 1024;
export async function workFingerprint(cwd: string): Promise<WorkFingerprint | undefined> {
  try {
    const base = await realpath(cwd);
    const [head, diff, untracked] = await Promise.all([
      git(cwd, ["rev-parse", "--verify", "HEAD"]),
      git(cwd, ["diff", "HEAD", "--no-ext-diff", "--no-textconv", "--no-color", "--binary"]),
      git(cwd, ["ls-files", "--others", "--exclude-standard", "-z"]),
    ]);
    const hash = createHash("sha256").update(diff).update("\0").update(untracked);
    const names = untracked.toString("utf8").split("\0").filter(Boolean);
    if (names.length > 256) return undefined;
    let remaining = LIMIT;
    for (const name of names) {
      if (!safeReviewPath(name)) return undefined;
      const path = join(base, name), info = await lstat(path);
      if (!info.isFile() || info.size > remaining || relative(base, await realpath(path)).startsWith("..")) return undefined;
      const file = await open(path, "r");
      try {
        // Read at most the aggregate budget + 1, even if a file grows after stat.
        const buffer = Buffer.alloc(remaining + 1);
        let length = 0;
        while (length < buffer.length) {
          const result = await file.read(buffer, length, buffer.length - length, null);
          if (!result.bytesRead) break;
          length += result.bytesRead;
        }
        if (length > remaining) return undefined;
        remaining -= length;
        hash.update(String(length)).update("\0").update(buffer.subarray(0, length));
      } finally { await file.close(); }
    }
    return { base, head: head.toString("utf8").trim(), changes: hash.digest("hex") };
  } catch { return undefined; }
}
export async function scriptCandidates(cwd: string) {
  try {
    const root = await realpath(cwd), path = join(root, "package.json");
    const info = await lstat(path);
    if (!info.isFile() || info.size > LIMIT || relative(root, await realpath(path)).startsWith("..")) return [];
    const buffer = await readFile(path);
    return buffer.length <= LIMIT ? checkCandidates(JSON.parse(buffer.toString("utf8"))) : [];
  } catch { return []; }
}
// The saved base wins, even if absent on disk. Only the current writer is a fallback.
export function questCheckBase(quests: QuestLedger, id: string, sessions: TerminalSession[]): string | undefined {
  const quest = quests.get(id);
  return quest && checkBasePath(quest, quests.party(id).find((member) => member.writer)?.session, sessions);
}
const readVersions = new WeakMap<QuestLedger, Map<string, symbol>>();
export function forgetCheckFingerprint(quests: QuestLedger, id: string): void {
  readVersions.get(quests)?.delete(id);
  quests.checks.fingerprints.delete(id);
}
function versionFor(quests: QuestLedger, id: string): { versions: Map<string, symbol>; version: symbol } {
  const versions = readVersions.get(quests) ?? new Map<string, symbol>(); readVersions.set(quests, versions);
  const version = Symbol(); versions.set(id, version); return { versions, version };
}
export async function refreshCheckFingerprint(quests: QuestLedger, id: string, sessions: TerminalSession[]): Promise<WorkFingerprint | undefined> {
  if (!quests.get(id)) return undefined;
  const cwd = questCheckBase(quests, id, sessions);
  const { versions, version } = versionFor(quests, id);
  const fingerprint = cwd ? await workFingerprint(cwd) : undefined;
  if (versions.get(id) === version && quests.get(id)) {
    const current = questCheckBase(quests, id, sessions) === cwd ? fingerprint : undefined;
    const previous = quests.checks.fingerprints.get(id);
    quests.checks.fingerprints.set(id, current);
    if (JSON.stringify(previous) !== JSON.stringify(current)) quests.checksChanged();
  }
  return fingerprint;
}
export function observeChecks(quests: QuestLedger, session: TerminalSession, event: AgentEvent, at: number, sessions: TerminalSession[] = [session]): void {
  const quest = quests.current(session.id);
  if (!quest) return;
  if (!event.subagent && ["Stop", "StopFailure"].includes(event.hook ?? "")) {
    void refreshCheckFingerprint(quests, quest.id, sessions).catch(() => undefined); return;
  }
  const matches = evidenceChecks(event, quest.checks ?? []), command = checkCommand(event);
  if (!matches || !command) return;
  const evidence = { command: truncateEventString(command, 200), passed: event.hook === "PostToolUse" && event.state !== "error",
    at, session: session.id, hero: event.agent, base: session.cwd, checks: matches };
  // The event and evidence are recorded synchronously BEFORE starting any Git read.
  const id = quests.checks.record(quest.id, evidence);
  quests.checksChanged();
  void workFingerprint(session.cwd).then((fingerprint) => {
    quests.checks.attach(id, fingerprint); quests.checksChanged();
    return refreshCheckFingerprint(quests, quest.id, sessions);
  }).catch(() => undefined);
}
