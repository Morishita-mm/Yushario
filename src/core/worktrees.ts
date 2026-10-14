export type Worktree = { path: string; head: string; branch?: string; detached?: boolean; bare?: boolean; locked?: boolean; prunable?: boolean };

// `git worktree list --porcelain -z`: NUL fields, empty field between records.
// The non-z form is also accepted for ordinary paths (Git quotes unusual paths there).
export function parseWorktrees(output: string): Worktree[] {
  const result: Worktree[] = [];
  let current: Worktree | undefined;
  for (const field of output.split(output.includes("\0") ? "\0" : "\n")) {
    if (field.startsWith("worktree ")) {
      current = { path: field.slice(9), head: "" };
      result.push(current);
    } else if (current) {
      if (field.startsWith("HEAD ")) current.head = field.slice(5);
      else if (field.startsWith("branch refs/heads/")) current.branch = field.slice(18);
      else if (field === "detached") current.detached = true;
      else if (field === "bare") current.bare = true;
      else if (field === "locked" || field.startsWith("locked ")) current.locked = true;
      else if (field === "prunable" || field.startsWith("prunable ")) current.prunable = true;
    }
  }
  return result;
}

export function validWorktreeBranch(branch: unknown): branch is string {
  return typeof branch === "string" && branch.length > 0 && branch.length <= 200
    && !branch.startsWith("-") && !branch.startsWith("/") && !branch.endsWith("/")
    && !branch.endsWith(".") && !branch.includes("..") && !branch.includes("@{") && branch !== "@"
    && !/[\s\x00-\x20\x7f~^:?*\[\\]/.test(branch)
    && branch.split("/").every((part) => part.length > 0 && !part.startsWith(".") && !part.endsWith(".lock"));
}

export function validWorktreePath(path: unknown): path is string {
  return typeof path === "string" && path.startsWith("/") && path.length <= 4096
    && !/[\x00-\x1f\x7f]/.test(path) && path !== "/"
    && path.split("/").every((part) => part !== "." && part !== "..");
}

// Inputs have been resolved through existing symlink ancestors by the server.
export function insideWorktree(path: string, trees: readonly Worktree[]): boolean {
  return trees.some((tree) => path === tree.path || path.startsWith(`${tree.path.replace(/\/$/, "")}/`));
}

export function worktreeSlug(title: string): string {
  return title.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "") || "quest";
}
