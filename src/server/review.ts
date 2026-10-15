import { gitText as git } from "./git";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isAbsolute, join, relative } from "node:path";
import { parseGitNameStatus, parseGitNumstat, parseGitStatus, safeReviewPath, type Review, type ReviewDiff } from "../core/review";
import { defaultReviewBase, reviewBasePath, validReviewBranch, type ReviewResult } from "../core/review-base";
import type { QuestDetail } from "../core/quests";
import { tr } from "./language";

const LIMIT = 1024 * 1024;
class ReviewError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || rel !== ".." && !rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(rel);
}
// Check every existing ancestor, including dangling symlinks; deleted files are valid diff targets.
async function checkedPath(cwd: string, path: string): Promise<string> {
  if (!safeReviewPath(path)) throw new ReviewError(400, tr("この パスは ひらけない", "Cannot open this path"));
  const root = await realpath(cwd);
  let candidate = root;
  for (const part of path.split("/")) {
    candidate = join(candidate, part);
    try {
      await lstat(candidate);
      const actual = await realpath(candidate);
      if (!inside(root, actual)) throw new ReviewError(403, tr("フォルダの 外は よめない", "Cannot read outside this folder"));
    } catch (error) {
      if (error instanceof ReviewError) throw error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      try { if ((await lstat(candidate)).isSymbolicLink()) throw new ReviewError(403, tr("この パスは ひらけない", "Cannot open this path")); }
      catch (missing) { if (missing instanceof ReviewError) throw missing; }
    }
  }
  return join(root, path);
}
async function checkedBase(session: { cwd: string } | undefined, quest: QuestDetail | undefined): Promise<string> {
  const saved = quest ? reviewBasePath(quest) : session?.cwd;
  if (!saved) throw new ReviewError(404, tr("拠点が のこっていない", "No saved base"));
  let cwd: string;
  try { cwd = await realpath(saved); if (!(await stat(cwd)).isDirectory()) throw new Error(); }
  catch { throw new ReviewError(404, tr("拠点が もう ない", "The base is gone")); }
  if ((await git(cwd, ["rev-parse", "--is-inside-work-tree"])).trim() !== "true") throw new ReviewError(400, tr("git の 作業ツリーでは ない", "Not a Git worktree"));
  if (quest) {
    const common = await realpath((await git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"])).trim());
    if (common !== quest.town) throw new ReviewError(400, tr("この町の 拠点では ない", "This base belongs to another town"));
  }
  return cwd;
}
async function baseline(cwd: string): Promise<string[]> {
  try { await git(cwd, ["rev-parse", "--verify", "HEAD"]); return ["HEAD"]; }
  catch { return []; }
}
const DIFF = ["diff", "--no-ext-diff", "--no-textconv", "--no-color", "--relative", "--find-renames"];
async function comparison(cwd: string, url: URL): Promise<{ info: NonNullable<Review["comparison"]>; base: string[] }> {
  const mode = url.searchParams.get("mode") ?? "uncommitted", chosen = url.searchParams.get("base");
  if (mode !== "branch" && mode !== "uncommitted" || chosen !== null && !validReviewBranch(chosen)) throw new ReviewError(400, tr("比べる元が 正しくない", "Invalid comparison base"));
  const refs = (await git(cwd, ["for-each-ref", "--format=%(refname)", "refs/heads/", "refs/remotes/"])).trim().split("\n").filter((ref) => ref && !ref.endsWith("/HEAD"));
  const branches = [...new Set(refs.map((ref) => ref.replace(/^refs\/(heads|remotes)\//, "")))].filter(validReviewBranch);
  let origin: string | undefined;
  try { origin = (await git(cwd, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"])).trim(); } catch { /* No remote default. */ }
  const defaultBase = defaultReviewBase(branches, origin), base = chosen ?? defaultBase;
  const info: NonNullable<Review["comparison"]> = { mode, branches, defaultBase, base };
  if (mode === "uncommitted") return { info, base: await baseline(cwd) };
  if (!base || !branches.includes(base)) throw new ReviewError(400, tr("比べる元の branch を えらんで", "Choose a branch to compare"));
  try { await git(cwd, ["check-ref-format", "--branch", base]); }
  catch { throw new ReviewError(400, tr("branch 名が 正しくない", "Invalid branch name")); }
  const ref = refs.find((ref) => ref === `refs/heads/${base}`) ?? `refs/remotes/${base}`;
  try { info.mergeBase = (await git(cwd, ["merge-base", "HEAD", ref])).trim(); }
  catch { throw new ReviewError(400, tr("共通の コミットが みつからない", "No common commit found")); }
  return { info, base: [info.mergeBase] };
}
async function summary(cwd: string, url: URL): Promise<{ review: Review; base: string[] }> {
  const review = parseGitStatus(await git(cwd, ["status", "--porcelain=v2", "-z", "--branch", "--untracked-files=all", "--", "."]));
  const strip = (await git(cwd, ["rev-parse", "--show-prefix"])).replace(/\n$/, "");
  review.files = review.files.filter((file) => file.path.startsWith(strip)).map((file) => ({ ...file,
    path: file.path.slice(strip.length), ...(file.oldPath ? { oldPath: file.oldPath.startsWith(strip) ? file.oldPath.slice(strip.length) : undefined } : {}),
  }));
  const { info, base } = await comparison(cwd, url);
  if (info.mode === "branch") review.files = [...parseGitNameStatus(await git(cwd, [...DIFF, "--name-status", "-z", ...base, "--", "."])), ...review.files.filter((file) => file.status === "untracked")];
  const outputs = base.length ? [await git(cwd, [...DIFF, "--numstat", "-z", ...base, "--", "."])]
    : [await git(cwd, [...DIFF, "--numstat", "-z", "--cached", "--", "."]), await git(cwd, [...DIFF, "--numstat", "-z", "--", "."])];
  for (const output of outputs) for (const tally of parseGitNumstat(output)) {
    const file = review.files.find((file) => file.path === tally.path);
    if (!file) continue;
    file.binary = Boolean(file.binary || tally.binary);
    if (!file.binary) { file.added = (file.added ?? 0) + (tally.added ?? 0); file.removed = (file.removed ?? 0) + (tally.removed ?? 0); }
  }
  return { review: { cwd, ...review, comparison: info }, base };
}
function tooLarge(error: unknown): boolean { return (error as NodeJS.ErrnoException).code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"; }
async function readDiff(cwd: string, path: string, url: URL): Promise<ReviewDiff> {
  const absolute = await checkedPath(cwd, path);
  const { review, base } = await summary(cwd, url), file = review.files.find((file) => file.path === path);
  if (!file) throw new ReviewError(404, tr("この ファイルに 差分は ない", "No changes in this file"));
  if (file.binary) return { binary: true };
  if (file.status !== "deleted") {
    const info = await stat(absolute);
    if (!info.isFile()) throw new ReviewError(400, tr("この ファイルは よめない", "Cannot read this file"));
    if (info.size > LIMIT) return { tooLarge: true };
  }
  if (file.status === "untracked") {
    const buffer = await readFile(absolute);
    if (buffer.length > LIMIT) return { tooLarge: true };
    if (buffer.includes(0)) return { binary: true };
    const lines = buffer.toString("utf8").split("\n");
    if (lines.at(-1) === "") lines.pop();
    const text = `@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => `+${line}`).join("\n")}\n`;
    return Buffer.byteLength(text) > LIMIT ? { tooLarge: true } : { text };
  }
  if (file.oldPath) await checkedPath(cwd, file.oldPath);
  const paths = file.oldPath ? [file.oldPath, path] : [path];
  try {
    const text = base.length ? await git(cwd, [...DIFF, ...base, "--", ...paths])
      : (await git(cwd, [...DIFF, "--cached", "--", ...paths])) + (await git(cwd, [...DIFF, "--", ...paths]));
    if (Buffer.byteLength(text) > LIMIT) return { tooLarge: true };
    return /^(?:Binary files .* differ|GIT binary patch)$/m.test(text) ? { binary: true } : { text };
  } catch (error) { if (tooLarge(error)) return { tooLarge: true }; throw error; }
}
export async function reviewResult(cwd: string): Promise<ReviewResult> {
  const [head, branch] = await Promise.all([git(cwd, ["rev-parse", "--short=7", "HEAD"]),
    git(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]).catch(() => "(detached)")]);
  return { cwd, branch: branch.trim(), head: head.trim() };
}
export async function handleReview(request: IncomingMessage, response: ServerResponse, url: URL,
  session: { cwd: string } | undefined, quest: QuestDetail | undefined, reviewed: () => void): Promise<void> {
  const json = (status: number, value: unknown) => response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(value));
  if (request.method !== "GET") { response.writeHead(405, { Allow: "GET" }).end(); return; }
  if (url.searchParams.has("cwd")) { json(400, { error: tr("この フォルダは よめない", "Cannot read this folder") }); return; }
  if (url.searchParams.has("quest") ? !quest : !session) { json(404, { error: tr("鑑定する 拠点が みつからない", "Review base not found") }); return; }
  try {
    const cwd = await checkedBase(session, quest);
    if (url.pathname === "/api/review/diff") json(200, await readDiff(cwd, url.searchParams.get("path") ?? "", url));
    else { const { review } = await summary(cwd, url); reviewed(); json(200, review); }
  } catch (error) {
    if (error instanceof ReviewError) json(error.status, { error: error.message });
    else json(400, { error: tooLarge(error) ? tr("大きすぎて 出せない", "Too large to show") : tr("git の きろくが ない", "No git record") });
  }
}
