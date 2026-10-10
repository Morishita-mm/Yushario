import { execFile } from "node:child_process";
import { basename, resolve } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

export async function projectName(cwd: string): Promise<string> {
  cwd = resolve(cwd);
  try {
    // The first worktree is the original repository, even from a linked worktree or subdirectory.
    const { stdout } = await execute("git", ["-C", cwd, "worktree", "list", "--porcelain", "-z"], {
      timeout: 150, maxBuffer: 64 * 1024,
    });
    const main = stdout.split("\0")[0];
    if (main.startsWith("worktree ")) return basename(resolve(main.slice(9))) || "root";
  } catch { /* Not a Git repository (or Git unavailable): use the directory name. */ }
  return basename(cwd) || "root";
}
