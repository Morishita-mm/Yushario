import { describe, expect, it } from "vitest";
import { parseMarkdown } from "./markdown";
import { markdownInlineText, parseMarkdownInline } from "./markdown-inline";

const text = (value: string) => ({ type: "text", text: value });

describe("markdown inline subset", () => {
  it("reads both forms of bold and italic, strikeout, and literal code", () => {
    expect(parseMarkdownInline("**太字** __bold__ *斜体* _italic_ ~~old~~ `**raw**`")) .toEqual([
      { type: "strong", children: [text("太字")] }, text(" "),
      { type: "strong", children: [text("bold")] }, text(" "),
      { type: "em", children: [text("斜体")] }, text(" "),
      { type: "em", children: [text("italic")] }, text(" "),
      { type: "del", children: [text("old")] }, text(" "), { type: "code", text: "**raw**" },
    ]);
  });
  it("nests emphasis and handles escapes and multiple backticks", () => {
    expect(parseMarkdownInline("**bold *italic***")).toEqual([
      { type: "strong", children: [text("bold "), { type: "em", children: [text("italic")] }] },
    ]);
    expect(parseMarkdownInline("***both***")).toEqual([
      { type: "strong", children: [{ type: "em", children: [text("both")] }] },
    ]);
    expect(parseMarkdownInline("\\*literal\\* ``a ` b``")).toEqual([text("*literal* "), { type: "code", text: "a ` b" }]);
  });
  it("does not interpret underscores in English words", () => {
    expect(parseMarkdownInline("snake_case a_b_c foo__bar__baz")).toEqual([text("snake_case a_b_c foo__bar__baz")]);
  });
  it("makes HTTP(S) links and image alternatives, never images", () => {
    expect(parseMarkdownInline("[**site**](https://example.com/a(b)) ![alt](http://example.com/p.png)")) .toEqual([
      { type: "link", href: "https://example.com/a(b)", children: [{ type: "strong", children: [text("site")] }] }, text(" "),
      { type: "link", href: "http://example.com/p.png", children: [text("alt")] },
    ]);
    expect(parseMarkdownInline("Visit https://example.com/a(b).")) .toEqual([
      text("Visit "), { type: "link", href: "https://example.com/a(b)", children: [text("https://example.com/a(b)")] }, text("."),
    ]);
  });
  it.each(["javascript:alert(1)", "JavaScript:alert(1)", "file:///tmp/a", "data:text/html,x", "/relative", "../a", "//example.com", "https://a\u0000b", "https://a b"])("leaves unsafe link %s literal", (url) => {
    const source = `[x](${url}) ![alt](${url})`;
    expect(parseMarkdownInline(source)).toEqual([text(source)]);
  });
  it("leaves tags and their attributes literal", () => {
    const source = '<script>window.__qaXss=1</script> <img src="https://a.test" onerror="window.__qaXss=2">';
    expect(parseMarkdownInline(source)).toEqual([text(source)]);
  });
  it.each(["**unclosed", "__unclosed", "*unclosed", "~~unclosed", "`unclosed", "[x](https://a.test", "![alt](file:/a)"])("does not lose malformed source %s", (source) => {
    expect(markdownInlineText(parseMarkdownInline(source))).toBe(source);
  });
  it("does not close emphasis inside code, tags, or link destinations", () => {
    for (const source of ['__unclosed `__code`', '**unclosed <img title="**">', '__unclosed [x](https://example.com/__)']) {
      expect(parseMarkdownInline(source).some((part) => part.type === "strong")).toBe(false);
    }
  });
  it("keeps unsupported math, footnotes, and emoji shortcuts literal", () => {
    const source = "$x$ [^note] :smile:";
    expect(parseMarkdownInline(source)).toEqual([text(source)]);
  });
});

describe("markdown blocks", () => {
  it("reads headings 1–6, paragraphs, blank lines, and rules", () => {
    const headings = parseMarkdown(Array.from({ length: 6 }, (_, i) => `${"#".repeat(i + 1)} title`).join("\n"));
    expect(headings.map((block) => block.type === "heading" ? block.level : 0)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(parseMarkdown("first\nsecond\n\n---\n\nlast")).toEqual([
      { type: "paragraph", children: [text("first\nsecond")] }, { type: "blank" },
      { type: "rule" }, { type: "blank" }, { type: "paragraph", children: [text("last")] },
    ]);
    expect(parseMarkdown("####### not a heading")[0]).toEqual({ type: "paragraph", children: [text("####### not a heading")] });
    expect(parseMarkdown("# C#\n## title ##\n###")).toEqual([
      { type: "heading", level: 1, children: [text("C#")] },
      { type: "heading", level: 2, children: [text("title")] },
      { type: "heading", level: 3, children: [] },
    ]);
  });
  it("reads all unordered markers, ordered starts, nesting, and checkboxes", () => {
    expect(parseMarkdown("- parent\n  - [ ] todo\n  + [X] done\n* sibling\n+ last\n\n3. third\n4. fourth")).toEqual([
      { type: "list", ordered: false, start: 1, items: [
        { blocks: [{ type: "paragraph", children: [text("parent")] },
          { type: "list", ordered: false, start: 1, items: [
            { checked: false, blocks: [{ type: "paragraph", children: [text("todo")] }] },
            { checked: true, blocks: [{ type: "paragraph", children: [text("done")] }] },
          ] }] },
        { blocks: [{ type: "paragraph", children: [text("sibling")] }] },
        { blocks: [{ type: "paragraph", children: [text("last")] }] },
      ] }, { type: "blank" },
      { type: "list", ordered: true, start: 3, items: [
        { blocks: [{ type: "paragraph", children: [text("third")] }] },
        { blocks: [{ type: "paragraph", children: [text("fourth")] }] },
      ] },
    ]);
  });
  it("reads nested quotes and fenced code without language metadata", () => {
    expect(parseMarkdown("> quote\n>\n> > nested\n\n```ts\nconst x = '<script>';\n**literal**\n```")) .toEqual([
      { type: "quote", blocks: [{ type: "paragraph", children: [text("quote")] }, { type: "blank" },
        { type: "quote", blocks: [{ type: "paragraph", children: [text("nested")] }] }] }, { type: "blank" },
      { type: "code", text: "const x = '<script>';\n**literal**\n" },
    ]);
  });
  it("reads aligned tables, parses cells, pads short rows, and drops extra cells", () => {
    expect(parseMarkdown("| Left | Middle | Right |\n| :--- | :---: | ---: |\n| **a** | b | c | extra |\n| d |\n| e\\|f | `g` | h |")) .toEqual([
      { type: "table", align: ["left", "center", "right"], header: [[text("Left")], [text("Middle")], [text("Right")]], rows: [
        [[{ type: "strong", children: [text("a")] }], [text("b")], [text("c")]],
        [[text("d")], [], []], [[text("e|f")], [{ type: "code", text: "g" }], [text("h")]],
      ] },
    ]);
    expect(parseMarkdown("A | B\n--- | ---\na | b")[0].type).toBe("table");
  });
  it("keeps invalid tables and unclosed fences readable", () => {
    const source = "| A | B |\n| --- |\n| a | b |";
    expect(parseMarkdown(source)).toEqual([{ type: "paragraph", children: [text(source)] }]);
    expect(parseMarkdown("```ts\nunclosed **bold")).toEqual([{ type: "paragraph", children: [text("```ts\nunclosed **bold")] }]);
  });
  it("normalizes CRLF and bounds deeply nested input without throwing", () => {
    expect(parseMarkdown("a\r\nb")).toEqual([{ type: "paragraph", children: [text("a\nb")] }]);
    expect(() => parseMarkdown("> ".repeat(200) + "x")).not.toThrow();
    expect(() => parseMarkdown("**[x](javascript:alert(1)) ".repeat(300))).not.toThrow();
  });
});
