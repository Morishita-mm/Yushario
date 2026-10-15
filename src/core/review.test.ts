import { describe, expect, it } from "vitest";
import { diffLines, parseGitNameStatus, parseGitNumstat, parseGitStatus, safeReviewPath } from "./review";
import { absoluteFile, editorUrl, fileReference } from "./file-path";
import { reportTitle } from "./quests";
import type { TalkReport } from "./turns";

describe("git review records", () => {
  it("reads branch, upstream and every status with NUL-safe names", () => {
    const review = parseGitStatus("# branch.oid abcdef012345\0# branch.head main\0# branch.ab +2 -3\0"
      + "1 .M N... 100644 100644 100644 aaa aaa src/a b.ts\0"
      + "1 A. N... 000000 100644 100644 000 aaa added.ts\0"
      + "1 .D N... 100644 100644 000000 aaa aaa gone.ts\0"
      + "2 R. N... 100644 100644 100644 aaa aaa R100 renamed.ts\0old\tname.ts\0? new\nfile.ts\0");
    expect(review).toEqual({ branch: "main", head: "abcdef0", ahead: 2, behind: 3, files: [
      { path: "src/a b.ts", status: "modified" }, { path: "added.ts", status: "added" },
      { path: "gone.ts", status: "deleted" }, { path: "renamed.ts", oldPath: "old\tname.ts", status: "renamed" },
      { path: "new\nfile.ts", status: "untracked" },
    ] });
  });
  it("reads net branch changes with rename pairs and NUL-safe paths", () => {
    expect(parseGitNameStatus("A\0new\nfile.ts\0M\0a b.ts\0D\0gone.ts\0R100\0old\tfile.ts\0renamed.ts\0")).toEqual([
      { path: "new\nfile.ts", status: "added" }, { path: "a b.ts", status: "modified" }, { path: "gone.ts", status: "deleted" },
      { path: "renamed.ts", oldPath: "old\tfile.ts", status: "renamed" },
    ]);
  });
  it("reads numstat renames, binary and unusual paths", () => {
    expect(parseGitNumstat("2\t1\tsrc/a b.ts\0-\t-\tasset.png\0 0\t1\tbad\0"
      + "0\t0\t\0old.ts\0new.ts\0")).toEqual([
      { path: "src/a b.ts", added: 2, removed: 1, binary: false }, { path: "asset.png", binary: true },
      { path: "new.ts", added: 0, removed: 0, binary: false },
    ]);
  });
  it("handles detached and unborn branches and malformed records", () => {
    expect(parseGitStatus("# branch.head (detached)\0# branch.oid (initial)\0garbage\0")).toMatchObject({ branch: "(detached)", head: "", files: [] });
  });
  it("numbers unified hunks without numbering metadata", () => {
    expect(diffLines("--- a/a\n+++ b/a\n@@ -5,2 +6,2 @@\n same\n-old\n+new\n\\ No newline at end of file\n")).toEqual([
      { text: "--- a/a", kind: "meta" }, { text: "+++ b/a", kind: "meta" },
      { text: "@@ -5,2 +6,2 @@", kind: "meta" }, { text: " same", kind: "context", old: 5, next: 6 },
      { text: "-old", kind: "remove", old: 6 }, { text: "+new", kind: "add", next: 7 },
      { text: "\\ No newline at end of file", kind: "meta" },
    ]);
  });
  it.each(["../secret", "/tmp/file", "a/../b", "a/./b", "C:/secret", "a\\b", "", "a\0b", "a//b"])("rejects %s", (path) => expect(safeReviewPath(path)).toBe(false));
  it("allows spaces and filenames beginning with dash (git uses --)", () => expect(safeReviewPath("src/-my file.ts")).toBe(true));
});

describe("review report headings", () => {
  const report: TalkReport = { kind: "scroll", files: ["a.ts"], tests: { passed: 0, failed: 0 }, tools: 1, failures: 0, startedAt: 0, endedAt: 1 };
  it("uses the same truthful headings for the saved quest and the report card", () => {
    expect(reportTitle(report, "ja")).toBe("ファイル 1つを かえた。まだ ためしていない");
    expect(reportTitle(report, "en")).toBe("Changed 1 files. Not tested yet");
    const failed = { ...report, tests: { passed: 0, failed: 1, last: "failed" as const } };
    expect(reportTitle(failed, "ja")).toBe("ファイル 1つを かえた。テストは しっぱい");
    expect(reportTitle(failed, "en")).toBe("Changed 1 files. Tests failed");
    const passed = { ...report, kind: "chest" as const, tests: { passed: 1, failed: 1, last: "passed" as const } };
    expect(reportTitle(passed, "ja")).toBe("しょうり！ ファイル 1つを なおした");
    expect(reportTitle(passed, "en")).toBe("Victory! Files fixed: 1");
    expect(reportTitle({ ...passed, stopFailure: true }, "en")).toBe("Went down partway…");
  });
});

describe("editor file links", () => {
  it("reads line/column suffixes and builds encoded editor URLs", () => {
    expect(fileReference("src/a.ts:42:3")).toEqual({ path: "src/a.ts", line: 42 });
    expect(absoluteFile("/tmp/my repo", "src/a.ts")).toBe("/tmp/my repo/src/a.ts");
    expect(editorUrl("vscode", "/tmp/my repo/src/a.ts", 42)).toBe("vscode://file/tmp/my%20repo/src/a.ts:42");
    expect(editorUrl("cursor", "/tmp/a.ts")).toBe("cursor://file/tmp/a.ts");
    expect(editorUrl("none", "/tmp/a.ts")).toBeUndefined();
  });
  it("only resolves files inside the hero folder", () => {
    expect(absoluteFile("/tmp/repo", "/tmp/repo/src/a.ts")).toBe("/tmp/repo/src/a.ts");
    for (const path of ["../outside", "/tmp/else/a.ts", "src/../../a.ts"]) expect(absoluteFile("/tmp/repo", path)).toBeUndefined();
    expect(fileReference("npm test")).toBeUndefined();
    expect(fileReference("https://example.com/a.ts")).toBeUndefined();
  });
});
