import { describe, expect, it } from "vitest";
import { mobilePermissionHashInput, parseMobileResponseBody, type MobilePermission } from "./mobile-display";
import { mobilePermissionCanAllow, type MobilePermissionChange } from "./mobile-permission";

const card: MobilePermission = { id: "p", heroId: "h", heroName: "勇者", town: "町", townId: "t", tool: "MultiEdit",
  summary: "変更", content: "example.ts", omitted: 0, expiresAt: 123, contentHash: "A".repeat(43),
  work: { questId: "q", title: "作業" }, change: { kind: "edit", edits: [{ before: "前", after: "後", replaceAll: false }], omitted: 0, omittedEdits: 0 } };
const parse = (value: unknown) => parseMobileResponseBody("permissions", { permissions: [value] });

describe("A4 permission review contract", () => {
  it("binds nested values, order, omission and nulls to the hash", () => {
    const hash = mobilePermissionHashInput(card);
    for (const patch of [
      { work: null }, { work: { questId: "other", title: "作業" } }, { work: { questId: "q", title: "別の作業" } },
      { change: { kind: "unavailable" } },
      ...[{ before: "違う", after: "後", replaceAll: false }, { before: "前", after: "違う", replaceAll: false },
        { before: "前", after: "後", replaceAll: true }].map(edit => ({ change: { kind: "edit", edits: [edit], omitted: 0, omittedEdits: 0 } })),
      { change: { ...card.change, omitted: 1 } }, { change: { ...card.change, omittedEdits: 1 } },
    ]) expect(mobilePermissionHashInput({ ...card, ...patch } as MobilePermission)).not.toEqual(hash);
    const edits = [{ before: "a", after: "b", replaceAll: false }, { before: "c", after: "d", replaceAll: true }];
    expect(mobilePermissionHashInput({ ...card, change: { kind: "edit", edits, omitted: 0, omittedEdits: 0 } })).not.toEqual(
      mobilePermissionHashInput({ ...card, change: { kind: "edit", edits: [...edits].reverse(), omitted: 0, omittedEdits: 0 } }));
  });

  it("requires exact shapes, tool correspondence, well-formed UTF-16 and aggregate bounds", () => {
    expect(parse(card)).toBeDefined();
    const write = { ...card, tool: "Write", change: { kind: "write", text: "\u0000\u202e\\u000a\n\t😀", omitted: 0 } };
    expect(parse(write)).toBeDefined(); // Rendering, not the protocol, makes controls visible.
    for (const value of [
      { ...card, work: undefined }, { ...card, work: { questId: "q", title: "t", cwd: "hidden" } },
      { ...card, change: null }, { ...card, tool: "Bash" }, { ...write, change: { ...write.change, text: "\ud800" } },
      { ...write, change: { ...write.change, text: "x".repeat(2001) } },
      { ...write, content: "p".repeat(2000), change: { ...write.change, text: "x".repeat(1001) } },
      { ...card, change: { kind: "edit", edits: Array(17).fill({ before: "", after: "", replaceAll: false }), omitted: 0, omittedEdits: 0 } },
      { ...card, change: { kind: "edit", edits: [{ before: "", after: "" }], omitted: 0, omittedEdits: 0 } },
      { ...write, change: { ...write.change, omitted: -1 } },
    ]) expect(parse(value)).toBeUndefined();
  });

  it("allows only complete tool inputs, regardless of whether work is known", () => {
    expect(mobilePermissionCanAllow(card)).toBe(true);
    expect(mobilePermissionCanAllow({ omitted: 0, change: null })).toBe(true);
    for (const change of [{ kind: "unavailable" }, { kind: "write", text: "", omitted: 1 },
      { kind: "edit", edits: [], omitted: 0, omittedEdits: 1 }, { kind: "edit", edits: [], omitted: 1, omittedEdits: 0 }] as MobilePermissionChange[]) {
      expect(mobilePermissionCanAllow({ omitted: 0, change })).toBe(false);
    }
    expect(mobilePermissionCanAllow({ ...card, omitted: 1 })).toBe(false);
  });
});
