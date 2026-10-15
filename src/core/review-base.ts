export type ReviewMode = "uncommitted" | "branch";
export type ReviewResult = { cwd: string; branch?: string; head?: string };

// Branch names, not revision expressions or options. Git checks the ref again at the I/O boundary.
export function validReviewBranch(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 1024 && !value.startsWith("-")
    && !/[\x00-\x20\x7f~^:?*\[\\]/.test(value) && !value.includes("..") && !value.includes("@{") && value !== "@"
    && value.split("/").every((part) => part !== "" && !part.startsWith(".") && !part.endsWith(".") && !part.endsWith(".lock"));
}
export function defaultReviewBase(branches: readonly string[], originHead?: string): string | undefined {
  return [originHead, "main", "master"].find((branch): branch is string => Boolean(branch && validReviewBranch(branch) && branches.includes(branch)));
}
export function reviewBasePath(quest: { worktreePath?: string; events: readonly { kind: string; at: number; result?: ReviewResult }[] }): string | undefined {
  if (quest.worktreePath) return quest.worktreePath;
  const saved = [...quest.events].filter((event) => event.result?.cwd).sort((a, b) => b.at - a.at);
  // A newer teammate's report is not a new assignment of the quest's base.
  return (saved.find((event) => event.kind === "assigned") ?? saved.find((event) => event.kind === "report"))?.result?.cwd;
}
