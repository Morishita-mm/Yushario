import { describe, expect, it } from "vitest";
import { mobileReportTitle, reportTitle } from "./quests";
import type { TalkReport } from "./turns";

const report: TalkReport = { kind: "talk", files: [], tests: { passed: 0, failed: 0 }, failures: 0, tools: 0, startedAt: 1, endedAt: 2 };
describe("mobile report headings", () => {
  it("uses Japanese terminal text, ordered by stop, last test, changes and report kind", () => {
    expect(mobileReportTitle(undefined)).toBe("返事が届いた");
    expect(mobileReportTitle(report)).toBe("返事が届いた");
    expect(mobileReportTitle({ ...report, kind: "scroll" })).toBe("調査から戻った");
    expect(mobileReportTitle({ ...report, kind: "scroll", files: ["a"] })).toBe("ファイル 1件を変更・テスト未実行");
    expect(mobileReportTitle({ ...report, files: ["a", "b"], tests: { passed: 1, failed: 1, last: "failed" } })).toBe("ファイル 2件を変更・テスト失敗");
    expect(mobileReportTitle({ ...report, files: ["a"], tests: { passed: 1, failed: 1, last: "passed" } })).toBe("ファイル 1件を変更・テスト成功");
    expect(mobileReportTitle({ ...report, tests: { passed: 0, failed: 1, last: "failed" } })).toBe("ファイル 0件を変更・テスト失敗");
    expect(mobileReportTitle({ ...report, tests: { passed: 1, failed: 0, last: "passed" } })).toBe("返事が届いた");
    expect(mobileReportTitle({ ...report, stopFailure: true, files: ["a"], tests: { passed: 0, failed: 1, last: "failed" } })).toBe("途中で止まった");
    expect(reportTitle({ ...report, files: ["a"] }, "ja")).toBe("ファイル 1つを かえた。まだ ためしていない");
    expect(reportTitle(undefined, "en")).toBe("A reply arrived");
  });
});
