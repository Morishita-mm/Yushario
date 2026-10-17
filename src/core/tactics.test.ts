import { describe, expect, it } from "vitest";
import { fixRequest, parseVerdict, relayToCommander, researchedRequest, researchRequest, reviewRequest, tacticFit, withoutVerdict, type TacticMember } from "./tactics";

const member = (session: string, role: TacticMember["role"], extra: Partial<TacticMember> = {}): TacticMember =>
  ({ session, role, writer: false, active: true, cwd: "/work/app", joinedAt: Number(session.replace(/\D/g, "")) || 0, ...extra });
const owner = member("s1", "implement", { writer: true });

describe("tactic fit", () => {
  it("lets anyone follow orders, even without an owner", () => {
    expect(tacticFit("obey", [])).toEqual({ ok: true, gaps: [], inside: [], outside: [] });
  });
  it("needs an owner and a reviewer in the owner's folder to review each other", () => {
    expect(tacticFit("review", [owner]).gaps).toEqual(["reviewer"]);
    expect(tacticFit("review", [member("s2", "review")]).gaps).toEqual(["owner", "same-folder"]);
    expect(tacticFit("review", [owner, member("s2", "review", { cwd: "/elsewhere" })]).gaps).toEqual(["same-folder"]);
    expect(tacticFit("review", [owner, member("s2", "review")])).toEqual({ ok: true, gaps: [], inside: ["s2"], outside: [] });
  });
  it("takes at most three helpers, in joining order; the rest and other roles stay outside", () => {
    const party = [owner, member("s2", "review"), member("s3", "review"), member("s4", "review"), member("s5", "review"), member("s6", "research")];
    expect(tacticFit("review", party)).toMatchObject({ ok: true, inside: ["s2", "s3", "s4"], outside: ["s5", "s6"] });
  });
  it("ignores members who left", () => {
    expect(tacticFit("review", [owner, member("s2", "review", { active: false })]).gaps).toEqual(["reviewer"]);
  });
  it("needs researchers to research first", () => {
    expect(tacticFit("research", [owner]).gaps).toEqual(["researcher"]);
    expect(tacticFit("research", [owner, member("s2", "research", { cwd: "/elsewhere" })]).inside).toEqual(["s2"]);
  });
  it("needs a commander who is not the owner for All yours", () => {
    expect(tacticFit("delegate", [owner]).gaps).toEqual(["commander"]);
    expect(tacticFit("delegate", [member("s1", "command", { writer: true })]).gaps).toEqual(["separate-commander"]);
    expect(tacticFit("delegate", [owner, member("s2", "command"), member("s3", "review")])).toMatchObject({ ok: true, inside: ["s2", "s3"] });
  });
});

describe("review verdicts", () => {
  it.each([["見ました。\n判定：OK", "ok"], ["直して。\n\n判定: 要修正", "changes"], ["Verdict: Changes", "changes"], ["**判定：OK**", "ok"], ["verdict: ok.", "ok"]])
  ("reads the last line: %s", (text, verdict) => { expect(parseVerdict(text)).toBe(verdict); });
  it.each(["判定：OK\nでも念のため確認して", "たぶん OK", "", "判定：たぶん"])
  ("does not guess when the last line is not a verdict: %s", (text) => { expect(parseVerdict(text)).toBeUndefined(); });
  it("drops only the verdict line from the findings", () => {
    expect(withoutVerdict("a.ts:3 が 重複\n判定：要修正\n")).toBe("a.ts:3 が 重複");
    expect(withoutVerdict("ただの 文")).toBe("ただの 文");
  });
});

describe("tactic messages", () => {
  it("asks reviewers not to change files and to end with a verdict", () => {
    const text = reviewRequest({ title: "保存を直す", purpose: "", folder: "/work/app" }, "直しました", 1, "ja");
    expect(text).toContain("ファイルは変更しないでください");
    expect(text).toContain("/work/app の git diff");
    expect(text.endsWith("「判定：OK」か「判定：要修正」のどちらかだけにしてください。")).toBe(true);
    const noted = reviewRequest({ title: "保存を直す", purpose: "" }, undefined, 1, "ja", "保存処理を とくに 見て");
    expect(noted.indexOf("あなたへの 頼みごと:\n保存処理を とくに 見て")).toBeLessThan(noted.indexOf("最終行は"));
  });
  it("hands every reviewer's findings to the owner without the verdict lines", () => {
    const text = fixRequest([{ name: "ソラ", text: "a.ts:3 が 重複\n判定：要修正" }, { name: "リク", text: "判定：要修正" }], 2, "ja");
    expect(text).toContain("2回目");
    expect(text).toContain("■ ソラ\na.ts:3 が 重複");
    expect(text).toContain("■ リク\n（理由の 書かれていない 要修正）");
    expect(text).not.toContain("判定：要修正");
  });
});

describe("research and delegate messages", () => {
  it("asks researchers with their focus and hands every report to the owner", () => {
    expect(researchRequest("保存を直して", "既存の保存処理", "ja")).toContain("見てほしい 観点: 既存の保存処理");
    const text = researchedRequest("保存を直して", [{ name: "ソラ", text: "save.ts にある\n" }], "ja");
    expect(text.startsWith("保存を直して")).toBe(true);
    expect(text).toContain("■ ソラ\nsave.ts にある");
    expect(relayToCommander("ソラ", "終わった", "ja")).toContain("ソラから 報告");
  });
});
