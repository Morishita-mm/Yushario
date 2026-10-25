import { execFileSync } from "node:child_process";

// Foreground jobs can have their own process group; snapshot the tree before killing the shell.
export function descendants(rootPid: number): number[] {
  // Windows has no ps; killTree handles the whole tree there.
  if (process.platform === "win32") return [];
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

// Windows has no signals or process groups; taskkill /T follows parent links, so run it while the shell is alive.
export function killTree(rootPid: number): void {
  if (process.platform !== "win32") return;
  try {
    execFileSync("taskkill", ["/PID", String(rootPid), "/T", "/F"], { stdio: "ignore", timeout: 2000, windowsHide: true });
  } catch { /* Already exited. */ }
}
