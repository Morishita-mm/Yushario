import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { join, relative } from "node:path";
import { checkCandidates, checkCommand, evidenceChecks, type WorkFingerprint } from "../core/checks";
import { truncateEventString, type AgentEvent } from "../core/events";
import type { QuestLedger } from "./quest-ledger";
import type { TerminalSession } from "./pty-session";

const LIMIT = 1024 * 1024;
function git(cwd: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => execFile("git", ["-c", "core.quotepath=false", "-c", "color.ui=false", ...args],
    { cwd, timeout: 5000, maxBuffer: LIMIT, encoding: "buffer", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_LITERAL_PATHSPECS: "1" } },
    (error, stdout) => error ? reject(error) : resolve(stdout)));
}
export async function workFingerprint(cwd: string): Promise<WorkFingerprint | undefined> {
  try {
    const [head, diff, untracked] = await Promise.all([
      git(cwd, ["rev-parse", "--verify", "HEAD"]),
      git(cwd, ["diff", "HEAD", "--no-ext-diff", "--no-textconv", "--no-color", "--binary"]),
      git(cwd, ["ls-files", "--others", "--exclude-standard", "-z"]),
    ]);
    return { head: head.toString("utf8").trim(), changes: createHash("sha256").update(diff).update("\0").update(untracked).digest("hex") };
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
// Only callers holding a known session pass a cwd. No API accepts arbitrary paths.
const readVersions = new WeakMap<QuestLedger, Map<string, number>>();
function versionFor(quests: QuestLedger, id: string): { versions: Map<string, number>; version: number } {
  const versions = readVersions.get(quests) ?? new Map<string, number>(); readVersions.set(quests, versions);
  const version = (versions.get(id) ?? 0) + 1; versions.set(id, version); return { versions, version };
}
export async function refreshCheckFingerprint(quests: QuestLedger, id: string, cwd?: string): Promise<WorkFingerprint | undefined> {
  const { versions, version } = versionFor(quests, id);
  const fingerprint = cwd ? await workFingerprint(cwd) : undefined;
  if (versions.get(id) === version && quests.get(id)) {
    const previous = quests.checks.fingerprints.get(id);
    quests.checks.fingerprints.set(id, fingerprint);
    if (JSON.stringify(previous) !== JSON.stringify(fingerprint)) quests.checksChanged();
  }
  return fingerprint;
}
export function observeChecks(quests: QuestLedger, session: TerminalSession, event: AgentEvent, at: number): void {
  const quest = quests.current(session.id);
  if (!quest) return;
  if (!event.subagent && ["Stop", "StopFailure"].includes(event.hook ?? "")) {
    void refreshCheckFingerprint(quests, quest.id, session.cwd).catch(() => undefined); return;
  }
  const matches = evidenceChecks(event, quest.checks ?? []), command = checkCommand(event);
  if (!matches || !command) return;
  const evidence = { command: truncateEventString(command, 200), passed: event.hook === "PostToolUse" && event.state !== "error",
    at, session: session.id, hero: event.agent, checks: matches };
  // The event and evidence are recorded synchronously BEFORE starting any Git read.
  const id = quests.checks.record(quest.id, evidence);
  quests.checksChanged();
  void refreshCheckFingerprint(quests, quest.id, session.cwd).then((fingerprint) => {
    quests.checks.attach(id, fingerprint); quests.checksChanged();
  }).catch(() => undefined);
}
