import { describe, expect, it } from "vitest";
import { fixRequest, validAdoption, validVerdict } from "./decisions";

describe("review decisions", () => {
  it("accepts only a known verdict and comparison", () => {
    expect(validVerdict({ verdict: "approved", mode: "uncommitted" })).toEqual({ verdict: "approved", mode: "uncommitted" });
    expect(validVerdict({ verdict: "changes", mode: "branch", base: "main" })).toEqual({ verdict: "changes", mode: "branch", base: "main" });
    expect(validVerdict({ verdict: "maybe", mode: "uncommitted" })).toBeUndefined();
    expect(validVerdict({ verdict: "approved", mode: "staged" })).toBeUndefined();
    expect(validVerdict({ verdict: "approved", mode: "uncommitted", base: "main" })).toBeUndefined();
    expect(validVerdict({ verdict: "approved", mode: "branch", base: "--output=x" })).toBeUndefined();
    expect(validVerdict({ verdict: "approved", mode: "uncommitted", head: "abc" })).toBeUndefined();
  });
  it("keeps an optional reason and only an https PR link", () => {
    expect(validAdoption({})).toEqual({});
    expect(validAdoption({ reason: "  tests passed  ", pr: " https://github.com/o/r/pull/1 " }))
      .toEqual({ reason: "tests passed", pr: "https://github.com/o/r/pull/1" });
    expect(validAdoption({ reason: "", pr: "" })).toEqual({});
    expect(validAdoption({ pr: "javascript:alert(1)" })).toBeUndefined();
    expect(validAdoption({ pr: "http://example.com/pull/1" })).toBeUndefined();
    expect(validAdoption({ reason: "x".repeat(501) })).toBeUndefined();
    expect(validAdoption({ reason: 1 })).toBeUndefined();
    expect(validAdoption({ head: "abc" })).toBeUndefined();
  });
  it("names each chosen place and what it was compared with", () => {
    const lines = [{ path: "src/b.ts", line: 9, text: "  return b;" }, { path: "src/a.ts", line: 3, text: "const a = 1;" }];
    expect(fixRequest(lines, { mode: "branch", base: "main", head: "abc1234" }, "en")).toBe([
      "Please fix these places (reviewed whole branch against main, HEAD abc1234):",
      "- src/a.ts:3  const a = 1;",
      "- src/b.ts:9  return b;",
      "What to change:",
    ].join("\n"));
    expect(fixRequest(lines.slice(0, 1), { mode: "uncommitted" }, "ja").split("\n")[0])
      .toBe("ここを なおして（まだ コミットしていない へんこうを 鑑定。HEAD ふめい）：");
  });
});
