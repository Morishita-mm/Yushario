import { openReview } from "../rpg/review-window";
import type { Review, ReviewDiff } from "../../core/review";
const review: Review = {
  cwd: "/tmp/tiny-quest", branch: "quest/fix", head: "abc1234", ahead: 1, behind: 2,
  files: [
    { path: "src/a.ts", status: "modified", added: 1, removed: 1 },
    { path: "new.ts", status: "added", added: 1, removed: 0 },
    { path: "gone.ts", status: "deleted", added: 0, removed: 1 },
    { path: "renamed.ts", oldPath: "old.ts", status: "renamed", added: 0, removed: 0 },
    { path: ".env", status: "untracked" }, { path: "image.png", status: "modified", binary: true },
    { path: "large.txt", status: "modified" },
  ],
};
const diffs: Record<string, ReviewDiff> = {
  "src/a.ts": { text: "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,2 @@\n-export const answer = 41;\n+export const answer = 42;\n // The answer\n" },
  "new.ts": { text: "@@ -0,0 +1 @@\n+export const ready = true;\n" },
  "gone.ts": { text: "@@ -1 +0,0 @@\n-export const old = true;\n" },
  "renamed.ts": { text: "similarity index 100%\nrename from old.ts\nrename to renamed.ts\n" },
  ".env": { text: "@@ -0,0 +1 @@\n+DEMO_ONLY=yes\n" },
  "image.png": { binary: true }, "large.txt": { tooLarge: true },
};
export function mockReview(name: string): void {
  openReview(name, "mock", () => undefined, () => undefined, undefined, { review, diffs });
}
