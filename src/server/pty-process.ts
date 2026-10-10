import { execFileSync } from "node:child_process";

// Foreground jobs can have their own process group; snapshot the tree before killing the shell.
export function descendants(rootPid: number): number[] {
  try {
    const rows = execFileSync("ps", ["-A", "-o", "pid=,ppid="], { encoding: "utf8", timeout: 1000 })
      .trim().split("\n").map((row) => row.trim().split(/\s+/).map(Number));
    const tree = new Set([rootPid]);
    for (const parent of tree) {
      for (const [pid, ppid] of rows) if (ppid === parent && pid > 0) tree.add(pid);
    }
    tree.delete(rootPid);
    return [...tree];
  } catch (error) {
    console.error("PTY の子プロセスを確認できませんでした:", error instanceof Error ? error.message : String(error));
    return [];
  }
}
