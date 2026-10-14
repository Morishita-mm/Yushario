import { describe, expect, it } from "vitest";
import { parseMarkdown } from "./markdown";
import { markdownPreview, markdownSize } from "./markdown-preview";

describe("interpreted markdown preview", () => {
  it("counts visible Unicode characters, not markers or link destinations", () => {
    const blocks = parseMarkdown("# **日😀**\n[x](https://example.com/long)\n- [x] _a_\n\n---");
    expect(markdownSize(blocks)).toEqual({ chars: 4, lines: 5 });
  });
  it("keeps ordinary blocks complete rather than leaking partial syntax", () => {
    const blocks = parseMarkdown("**abcd**\n\nnext");
    expect(markdownPreview(blocks, 4, 8)).toEqual({ blocks: blocks.slice(0, 2), more: true });
    expect(markdownPreview(blocks, 3, 8)).toEqual({ blocks: blocks.slice(0, 1), more: true });
    expect(markdownPreview(parseMarkdown("**a very long paragraph**"), 3, 8).more).toBe(false);
  });
  it("cuts tables only between rows and always retains a header", () => {
    const blocks = parseMarkdown("# T\n| A | B |\n| --- | --- |\n| **12** | 34 |\n| 56 | 78 |\n\nafter");
    const preview = markdownPreview(blocks, 7, 8);
    expect(preview.more).toBe(true);
    const table = preview.blocks[1];
    expect(table.type).toBe("table");
    if (table.type === "table") { expect(table.header).toHaveLength(2); expect(table.rows).toHaveLength(1); }
    expect(markdownSize(preview.blocks).chars).toBe(7);
    const headerOnly = markdownPreview(blocks.slice(1), 1, 1).blocks[0];
    if (headerOnly.type === "table") { expect(headerOnly.header).toHaveLength(2); expect(headerOnly.rows).toHaveLength(0); }
    else throw new Error("Missing table header");
  });
  it("cuts code only at complete lines, preserving literal markers", () => {
    const blocks = parseMarkdown("```js\n**a**\nb\nc\n```\nend");
    const preview = markdownPreview(blocks, 8, 2);
    expect(preview).toEqual({ blocks: [{ type: "code", text: "**a**\nb\n" }], more: true });
    expect(markdownPreview(blocks, 1, 1)).toEqual({ blocks: [{ type: "code", text: "**a**\n" }], more: true });
  });
  it("uses eight interpreted lines as the default, not the table delimiter line", () => {
    const source = "| Header |\n| --- |\n" + Array.from({ length: 10 }, (_, i) => `| Row ${i} |`).join("\n");
    const preview = markdownPreview(parseMarkdown(source));
    expect(preview.more).toBe(true);
    expect(markdownSize(preview.blocks).lines).toBe(8);
    const table = preview.blocks[0];
    if (table.type === "table") expect(table.rows).toHaveLength(7);
  });
  it("keeps nested lists and quotes together and does not mutate the full tree", () => {
    const blocks = parseMarkdown("start\n> **quote**\n> - nested\n- list\n  - child");
    const original = JSON.stringify(blocks);
    expect(markdownPreview(blocks, 5, 8)).toEqual({ blocks: blocks.slice(0, 1), more: true });
    expect(markdownSize(blocks)).toEqual({ chars: 25, lines: 5 });
    expect(JSON.stringify(blocks)).toBe(original);
  });
  it("has no more button for a whole document or empty input", () => {
    const blocks = parseMarkdown("plain\ntext");
    expect(markdownPreview(blocks)).toEqual({ blocks, more: false });
    expect(markdownPreview(parseMarkdown(""))).toEqual({ blocks: [], more: false });
  });
});
