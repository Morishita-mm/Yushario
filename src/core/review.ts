export type ReviewFile = {
  path: string; oldPath?: string;
  status: "modified" | "added" | "deleted" | "renamed" | "untracked";
  added?: number; removed?: number; binary?: boolean;
};
export type Review = { cwd: string; branch: string; head: string; ahead: number; behind: number; files: ReviewFile[] };
export type ReviewDiff = { text?: string; binary?: boolean; tooLarge?: boolean };
export type DiffLine = { text: string; kind: "add" | "remove" | "context" | "meta"; old?: number; next?: number };

// NUL records preserve spaces, tabs, newlines, and rename pairs without unquoting filenames.
export function parseGitStatus(output: string): Omit<Review, "cwd"> {
  const review: Omit<Review, "cwd"> = { branch: "", head: "", ahead: 0, behind: 0, files: [] };
  const records = output.split("\0");
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (record.startsWith("# branch.head ")) review.branch = record.slice(14);
    else if (record.startsWith("# branch.oid ")) review.head = record.slice(13) === "(initial)" ? "" : record.slice(13, 20);
    else if (record.startsWith("# branch.ab ")) {
      const match = /\+(\d+) -(\d+)/.exec(record);
      if (match) { review.ahead = Number(match[1]); review.behind = Number(match[2]); }
    } else if (record.startsWith("? ")) review.files.push({ path: record.slice(2), status: "untracked" });
    else if (/^[12u] /.test(record)) {
      const fields = record.split(" "), count = record[0] === "2" ? 9 : record[0] === "u" ? 10 : 8;
      const path = fields.slice(count).join(" "), xy = fields[1];
      if (!path || !xy) continue;
      const status = record[0] === "2" ? "renamed" : xy.includes("D") ? "deleted" : xy.includes("A") ? "added" : "modified";
      const oldPath = record[0] === "2" ? records[++i] : undefined;
      review.files.push({ path, status, ...(oldPath ? { oldPath } : {}) });
    }
  }
  return review;
}

export function parseGitNumstat(output: string): { path: string; added?: number; removed?: number; binary: boolean }[] {
  const records = output.split("\0"), result: ReturnType<typeof parseGitNumstat> = [];
  for (let i = 0; i < records.length; i++) {
    const match = /^(\d+|-)\t(\d+|-)\t([\s\S]*)$/.exec(records[i]);
    if (!match) continue;
    let path = match[3];
    if (!path) { i++; path = records[++i]; } // empty path, old name, new name
    if (!path) continue;
    const binary = match[1] === "-" || match[2] === "-";
    result.push({ path, binary, ...(!binary ? { added: Number(match[1]), removed: Number(match[2]) } : {}) });
  }
  return result;
}

export function safeReviewPath(path: string): boolean {
  return Boolean(path) && !/^[\\/]|^[a-z]:/i.test(path) && !/[\0\\]/.test(path)
    && path.split("/").every((part) => part !== ".." && part !== "." && part !== "");
}

export function diffLines(text: string): DiffLine[] {
  let old = 0, next = 0, inHunk = false;
  return text.split("\n").filter((line, index, all) => index < all.length - 1 || line !== "").map((text) => {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (hunk) { old = Number(hunk[1]); next = Number(hunk[2]); inHunk = true; }
    if (!inHunk || hunk || text.startsWith("\\")) return { text, kind: "meta" };
    if (text.startsWith("+")) return { text, kind: "add", next: next++ };
    if (text.startsWith("-")) return { text, kind: "remove", old: old++ };
    if (text.startsWith(" ")) return { text, kind: "context", old: old++, next: next++ };
    return { text, kind: "meta" };
  });
}
