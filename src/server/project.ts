import { execFile, execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
export type ProjectIdentity = { key: string; name: string; parent: string };
function identity(cwd: string, common?: string, main?: string): ProjectIdentity {
  const folder = realpathSync(main ? resolve(main) : cwd);
  return { key: realpathSync(common ? resolve(common.trim()) : cwd), name: basename(folder) || "root", parent: basename(dirname(folder)) };
}
const commonArgs = (cwd: string) => ["-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"];
const mainArgs = (cwd: string) => ["-C", cwd, "worktree", "list", "--porcelain", "-z"];
const mainPath = (output: string) => output.split("\0")[0].replace(/^worktree /, "");

export async function projectIdentity(cwd: string): Promise<ProjectIdentity> {
  cwd = realpathSync(resolve(cwd));
  try {
    const options = { timeout: 1000, maxBuffer: 64 * 1024 };
    const [common, main] = await Promise.all([execute("git", commonArgs(cwd), options), execute("git", mainArgs(cwd), options)]);
    return identity(cwd, common.stdout, mainPath(main.stdout));
  } catch { return identity(cwd); }
}

// Startup migration is small and synchronous, before the HTTP server starts.
export function storedProjectIdentity(cwd: string): ProjectIdentity | undefined {
  try {
    cwd = realpathSync(resolve(cwd));
    try {
      const options = { timeout: 1000, maxBuffer: 64 * 1024, encoding: "utf8" as const, stdio: ["ignore", "pipe", "ignore"] as ["ignore", "pipe", "ignore"] };
      return identity(cwd, execFileSync("git", commonArgs(cwd), options), mainPath(execFileSync("git", mainArgs(cwd), options)));
    } catch { return identity(cwd); }
  } catch { return; }
}
export async function projectName(cwd: string): Promise<string> { return (await projectIdentity(cwd)).name; }
