import { execFile } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import type { IncomingMessage, ServerResponse } from "node:http";
import { insideWorktree, parseWorktrees, validWorktreeBranch, validWorktreePath } from "../core/worktrees";
import { readJsonBody, SETTINGS_BODY_LIMIT } from "./http-body";
import { tr } from "./language";
import type { TerminalSession } from "./pty-session";

const execute = promisify(execFile);
const removing = new Set<string>();
const git = async (cwd: string, args: string[]) => (await execute("git", ["-C", cwd, ...args], { timeout: 5000, maxBuffer: 1024 * 1024 })).stdout;
const exists = (path: string): boolean => { try { lstatSync(path); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; } };

// Realpath the nearest existing ancestor too: a user-supplied parent may be a symlink.
function canonical(path: string): string {
  if (exists(path)) return realpathSync(path);
  const parent = dirname(path);
  return join(parent === path ? parent : canonical(parent), path.slice(parent.length + (parent === "/" ? 0 : 1)));
}
export function worktreeRemoving(cwd: string): boolean { return [...removing].some((path) => insideWorktree(realpathSync(cwd), [{ path, head: "" }])); }
export async function worktreeBranch(cwd: string): Promise<string | undefined> {
  try { return (await git(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"])).trim() || undefined; } catch { return; }
}
async function listing(cwd: string) {
  let output: string;
  try { output = await git(cwd, ["worktree", "list", "--porcelain", "-z"]); }
  catch { throw new Error(tr("git の きろくが ない", "No Git records here")); }
  const worktrees = parseWorktrees(output);
  const root = worktrees[0]?.path;
  if (!root || worktrees[0].bare) throw new Error(tr("この ばしょには 拠点を つくれない", "Cannot make a base here"));
  const branches = (await git(cwd, ["for-each-ref", "--format=%(refname:strip=2)", "refs/heads/"])).trim().split("\n").filter(Boolean);
  return { cwd, worktrees, branches, current: await worktreeBranch(cwd), root, defaultParent: `${root}.worktrees` };
}
function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(value));
}

export async function handleWorktrees(request: IncomingMessage, response: ServerResponse, url: URL,
  sessions: () => TerminalSession[], folded: (path: string) => void): Promise<void> {
  try {
    let value: Record<string, unknown>;
    if (request.method === "GET") value = { cwd: url.searchParams.get("cwd") };
    else if (request.method === "POST" || request.method === "DELETE") {
      const body = await readJsonBody(request, response, SETTINGS_BODY_LIMIT);
      if (!body.ok) return;
      if (!body.value || typeof body.value !== "object" || Array.isArray(body.value)) throw new Error(tr("拠点を えらんでください", "Choose a base"));
      value = body.value as Record<string, unknown>;
    } else { response.writeHead(405, { Allow: "GET, POST, DELETE" }).end(); return; }
    if (!validWorktreePath(value.cwd)) throw new Error(tr("町の 絶対パスを 指定してください", "Choose the town's absolute path"));
    const cwd = realpathSync(value.cwd);
    const info = await listing(cwd);
    if (request.method === "GET") { json(response, 200, info); return; }
    if (!validWorktreePath(value.path)) throw new Error(tr("置き場所は 絶対パスで 指定してください", "Use an absolute path for the base"));
    const path = canonical(resolve(value.path));
    if (request.method === "POST") {
      if (!validWorktreeBranch(value.branch)) throw new Error(tr("branch 名が 正しくない", "Invalid branch name"));
      try { await git(cwd, ["check-ref-format", "--branch", value.branch]); }
      catch { throw new Error(tr("branch 名が 正しくない", "Invalid branch name")); }
      if (info.branches.includes(value.branch)) throw new Error(tr("その branch は すでに ある", "That branch already exists"));
      if (typeof value.base !== "string" || !info.branches.includes(value.base)) throw new Error(tr("もとにする branch を えらんでください", "Choose a local branch to start from"));
      if (exists(resolve(value.path)) || insideWorktree(path, info.worktrees)) throw new Error(tr("その 置き場所は すでに つかわれている", "That path is already in use"));
      // Also reject a parent in another repository, not only this town's known worktrees.
      let parent = dirname(path);
      while (!exists(parent)) parent = dirname(parent);
      let nested = false;
      try { nested = (await git(parent, ["rev-parse", "--is-inside-work-tree", "--is-inside-git-dir"])).trim().split(/\s+/).includes("true"); } catch { /* Not a checkout. */ }
      if (nested) throw new Error(tr("ほかの 拠点の そとを えらんでください", "Choose a path outside existing checkouts"));
      // No shell, setup scripts, environment copying, or force flags.
      await git(cwd, ["worktree", "add", "-b", value.branch, path, value.base]);
      json(response, 201, { path, branch: value.branch });
    } else {
      const tree = info.worktrees.find((item) => canonical(item.path) === path);
      if (!tree || tree === info.worktrees[0]) throw new Error(tr("この 拠点は たためない", "Cannot fold this base"));
      if (removing.has(path)) throw new Error(tr("この 拠点は たたんでいる", "This base is folding"));
      removing.add(path);
      try {
        if (sessions().some((session) => !session.exited && insideWorktree(canonical(session.cwd), [{ path, head: "" }]))) throw new Error(tr("ここには まだ 勇者が いる", "A hero is still here"));
        if ((await git(path, ["status", "--porcelain", "--untracked-files=all"])).trim()) throw new Error(tr("へんこうが のこっている", "Changes remain here"));
        await git(cwd, ["worktree", "remove", path]);
        folded(path);
        json(response, 200, { path, branch: tree.branch });
      } finally { removing.delete(path); }
    }
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { killed?: boolean; stderr?: string };
    const message = failure.code || failure.stderr || failure.killed
      ? tr("拠点を かえられなかった。path と git の じょうたいを たしかめてね", "Could not change the base. Check its path and Git state")
      : error instanceof Error ? error.message : tr("拠点を かえられなかった", "Could not change the base");
    json(response, 400, { error: message });
  }
}
