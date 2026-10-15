import { gitText, gitTextSync } from "./git";
import { realpathSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
export type ProjectIdentity = { key: string; name: string; parent: string };
function identity(cwd: string, common?: string, main?: string): ProjectIdentity {
  const folder = realpathSync(main ? resolve(main) : cwd);
  return { key: realpathSync(common ? resolve(common.trim()) : cwd), name: basename(folder) || "root", parent: basename(dirname(folder)) };
}
const commonArgs = ["rev-parse", "--path-format=absolute", "--git-common-dir"];
const mainArgs = ["worktree", "list", "--porcelain", "-z"];
const mainPath = (output: string) => output.split("\0")[0].replace(/^worktree /, "");

export async function projectIdentity(cwd: string): Promise<ProjectIdentity> {
  cwd = realpathSync(resolve(cwd));
  try {
    const [common, main] = await Promise.all([gitText(cwd, commonArgs), gitText(cwd, mainArgs)]);
    return identity(cwd, common, mainPath(main));
  } catch { return identity(cwd); }
}

// Startup migration is small and synchronous, before the HTTP server starts.
export function storedProjectIdentity(cwd: string): ProjectIdentity | undefined {
  try {
    cwd = realpathSync(resolve(cwd));
    try {
      return identity(cwd, gitTextSync(cwd, commonArgs), mainPath(gitTextSync(cwd, mainArgs)));
    } catch { return identity(cwd); }
  } catch { return; }
}
export async function projectName(cwd: string): Promise<string> { return (await projectIdentity(cwd)).name; }
