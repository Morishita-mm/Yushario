import { describe, expect, it } from "vitest";
import { defaultReviewBase, reviewBasePath, validReviewBranch } from "./review-base";

describe("review comparison", () => {
  it("prefers the town's origin HEAD, then main, then master; never guesses the feature branch", () => {
    expect(defaultReviewBase(["main", "origin/trunk", "master"], "origin/trunk")).toBe("origin/trunk");
    expect(defaultReviewBase(["main", "master"], "origin/missing")).toBe("main");
    expect(defaultReviewBase(["master"])).toBe("master");
    expect(defaultReviewBase(["quest/result"])).toBeUndefined();
  });
  it.each(["main", "origin/main", "quest/日本語+'result"])("accepts branch %s", (name) => {
    expect(validReviewBranch(name)).toBe(true);
  });
  it.each(["", "--help", "-main", "main..HEAD", "../main", "main~1", "main^", "main:foo", "a b", "a\nb", "a\\b", "a@{1}", "/main", "main/", "a//b", ".main", "a/.b", "a.lock", "main.", "@", null])("rejects non-branch %s", (name) => {
    expect(validReviewBranch(name)).toBe(false);
  });
});
describe("saved review base", () => {
  it("keeps the saved base even when another assignment is newer", () => {
    expect(reviewBasePath({ worktreePath: "/saved", events: [{ kind: "assigned", at: 20, result: { cwd: "/other" } }] })).toBe("/saved");
  });
  it("falls back to the last saved assignee folder, not an arbitrary live terminal", () => {
    expect(reviewBasePath({ events: [{ kind: "assigned", at: 20, result: { cwd: "/last" } }, { kind: "report", at: 30, result: { cwd: "/teammate" } }, { kind: "assigned", at: 10, result: { cwd: "/old" } }] })).toBe("/last");
    expect(reviewBasePath({ events: [{ kind: "report", at: 20, result: { cwd: "/reported" } }] })).toBe("/reported");
    expect(reviewBasePath({ events: [] })).toBeUndefined();
  });
});
