import { execFile } from "node:child_process";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isAbsolute, join, relative } from "node:path";
import { parseGitNumstat, parseGitStatus, safeReviewPath, type Review, type ReviewDiff } from "../core/review";
import { tr } from "./language";

const LIMIT = 1024 * 1024;
class ReviewError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => execFile("git", ["-c", "core.quotepath=false", "-c", "color.ui=false", ...args],
    { cwd, timeout: 5000, maxBuffer: LIMIT, encoding: "utf8", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_LITERAL_PATHSPECS: "1" } },
    (error, stdout) => error ? reject(error) : resolve(stdout)));
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
      // A dangling symlink cannot be safely followed, even if its target does not exist.
      try { if ((await lstat(candidate)).isSymbolicLink()) throw new ReviewError(403, tr("この パスは ひらけない", "Cannot open this path")); }
      catch (missing) { if (missing instanceof ReviewError) throw missing; }
    }
  }
  return join(root, path);
}
async function baseline(cwd: string): Promise<string[]> {
  try { await git(cwd, ["rev-parse", "--verify", "HEAD"]); return ["HEAD"]; }
  catch { return []; }
}
const DIFF = ["diff", "--no-ext-diff", "--no-textconv", "--no-color", "--relative"];
async function summary(cwd: string): Promise<Review> {
  const review = parseGitStatus(await git(cwd, ["status", "--porcelain=v2", "-z", "--branch", "--untracked-files=all", "--", "."]));
  const prefix = await git(cwd, ["rev-parse", "--show-prefix"]);
  const strip = prefix.replace(/\n$/, "");
  review.files = review.files.filter((file) => file.path.startsWith(strip)).map((file) => ({ ...file,
    path: file.path.slice(strip.length), ...(file.oldPath ? { oldPath: file.oldPath.startsWith(strip) ? file.oldPath.slice(strip.length) : undefined } : {}),
  }));
  const base = await baseline(cwd);
  const outputs = base.length ? [await git(cwd, [...DIFF, "--numstat", "-z", ...base, "--", "."])]
    : [await git(cwd, [...DIFF, "--numstat", "-z", "--cached", "--", "."]), await git(cwd, [...DIFF, "--numstat", "-z", "--", "."])];
  for (const output of outputs) for (const tally of parseGitNumstat(output)) {
    const file = review.files.find((file) => file.path === tally.path);
    if (!file) continue;
    file.binary = Boolean(file.binary || tally.binary);
    if (!file.binary) { file.added = (file.added ?? 0) + (tally.added ?? 0); file.removed = (file.removed ?? 0) + (tally.removed ?? 0); }
  }
  return { cwd, ...review };
}
function tooLarge(error: unknown): boolean { return (error as NodeJS.ErrnoException).code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"; }
async function readDiff(cwd: string, path: string): Promise<ReviewDiff> {
  const absolute = await checkedPath(cwd, path);
  // Only paths in this session's actual status are readable, not an arbitrary file browser.
  const review = await summary(cwd), file = review.files.find((file) => file.path === path);
  if (!file) throw new ReviewError(404, tr("この ファイルに 差分は ない", "No changes in this file"));
  if (file.binary) return { binary: true };
  if (file.status !== "deleted") {
    const info = await stat(absolute);
    if (!info.isFile()) throw new ReviewError(400, tr("この ファイルは よめない", "Cannot read this file"));
    if (info.size > LIMIT) return { tooLarge: true };
  }
  if (file.status === "untracked") {
    // Content is read only after selecting this file. No untracked contents enter the overview.
    const buffer = await readFile(absolute);
    if (buffer.length > LIMIT) return { tooLarge: true };
    if (buffer.includes(0)) return { binary: true };
    const lines = buffer.toString("utf8").split("\n");
    if (lines.at(-1) === "") lines.pop();
    const text = `@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => `+${line}`).join("\n")}\n`;
    return Buffer.byteLength(text) > LIMIT ? { tooLarge: true } : { text };
  }
  if (file.oldPath) await checkedPath(cwd, file.oldPath);
  const base = await baseline(cwd), paths = file.oldPath ? [file.oldPath, path] : [path];
  try {
    const text = base.length ? await git(cwd, [...DIFF, ...base, "--", ...paths])
      : (await git(cwd, [...DIFF, "--cached", "--", ...paths])) + (await git(cwd, [...DIFF, "--", ...paths]));
    if (Buffer.byteLength(text) > LIMIT) return { tooLarge: true };
    return /^(?:Binary files .* differ|GIT binary patch)$/m.test(text) ? { binary: true } : { text };
  } catch (error) { if (tooLarge(error)) return { tooLarge: true }; throw error; }
}

export async function handleReview(request: IncomingMessage, response: ServerResponse, url: URL,
  session: { cwd: string } | undefined, reviewed: () => void): Promise<void> {
  const json = (status: number, value: unknown) => response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(value));
  if (request.method !== "GET") { response.writeHead(405, { Allow: "GET" }).end(); return; }
  if (!session) { json(404, { error: tr("その ターミナルは みつからない", "Terminal not found") }); return; }
  if (url.searchParams.has("cwd")) { json(400, { error: tr("この フォルダは よめない", "Cannot read this folder") }); return; }
  try {
    if (url.pathname === "/api/review/diff") json(200, await readDiff(session.cwd, url.searchParams.get("path") ?? ""));
    else {
      const review = await summary(session.cwd);
      reviewed();
      json(200, review);
    }
  } catch (error) {
    if (error instanceof ReviewError) json(error.status, { error: error.message });
    else json(400, { error: tooLarge(error) ? tr("大きすぎて 出せない", "Too large to show") : tr("git の きろくが ない", "No git record") });
  }
}
