import { describe, expect, it } from "vitest";
import { insideWorktree, parseWorktrees, validWorktreeBranch, validWorktreePath, worktreeSlug } from "./worktrees";
import { parseAgentEvent } from "./events";
import { Room } from "./room";

describe("worktree porcelain", () => {
  it("reads branches, detached HEAD, bare and flags without losing unusual paths", () => {
    expect(parseWorktrees("worktree /tmp/main\0HEAD abc\0branch refs/heads/main\0\0worktree /tmp/a\nb\0HEAD def\0detached\0locked reason\0prunable gone\0\0worktree /tmp/bare\0bare\0\0"))
      .toEqual([{ path: "/tmp/main", head: "abc", branch: "main" }, { path: "/tmp/a\nb", head: "def", detached: true, locked: true, prunable: true }, { path: "/tmp/bare", head: "", bare: true }]);
  });
  it("reads plain porcelain and empty repositories", () => {
    expect(parseWorktrees("worktree /tmp/repo\nHEAD 123\nbranch refs/heads/feature/a\n\n")[0].branch).toBe("feature/a");
    expect(parseWorktrees("")).toEqual([]);
  });
});
describe("branch metadata", () => {
  it("passes branch badges through events and clears a detached badge", () => {
    const parsed = parseAgentEvent({ state: "idle", agent: "hero", branch: "yushario/map" });
    expect(parsed.ok).toBe(true);
    const room = new Room();
    if (parsed.ok) expect(room.apply(parsed.event, 1)?.branch).toBe("yushario/map");
    expect(room.apply({ state: "idle", agent: "hero", branch: "" }, 2)?.branch).toBe("");
    expect(parseAgentEvent({ state: "idle", branch: 1 }).ok).toBe(false);
  });
});
describe("worktree input", () => {
  it("keeps safe Git branch names", () => {
    for (const branch of ["main", "yushario/fix-1", "修正/表示"]) expect(validWorktreeBranch(branch)).toBe(true);
    for (const branch of ["", "-b", "@{-1}", "a..b", "a b", "a\\b", "a:b", "a?b", "a[b", "a~b", "a^b", "a*", "a//b", "/main", "a/", "a.", ".a", "a/.b", "a.lock", "a.lock/b", "a\n", "@", 2]) expect(validWorktreeBranch(branch)).toBe(false);
  });
  it("requires a new absolute, non-traversing path", () => {
    for (const path of ["/tmp/repo.worktrees/fix", "/tmp/with space"]) expect(validWorktreePath(path)).toBe(true);
    for (const path of ["", "/", "relative", "/tmp/../repo", "/tmp/./repo", "/tmp/a\0b", "/tmp/a\nb", null]) expect(validWorktreePath(path)).toBe(false);
  });
  it("rejects destinations inside a known checkout but not siblings", () => {
    const trees = [{ path: "/tmp/app", head: "1" }];
    expect(insideWorktree("/tmp/app", trees)).toBe(true);
    expect(insideWorktree("/tmp/app/nested/base", trees)).toBe(true);
    expect(insideWorktree("/tmp/app.worktrees/base", trees)).toBe(false);
  });
  it("makes short Japanese and English quest names", () => {
    expect(worktreeSlug("Fix: the UI!")).toBe("fix-the-ui");
    expect(worktreeSlug("表示を 直す")).toBe("表示を-直す");
    expect(worktreeSlug("... ")).toBe("quest");
  });
});
