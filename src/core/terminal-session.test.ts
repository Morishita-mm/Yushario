import { describe, expect, it } from "vitest";
import { conversationText, initialPromptArgs, dimensions, outputStart, OUTPUT_LIMIT, sessionInputFields } from "./terminal-session";

const presets = ["claude", "codex", "pi", "shell"];
describe("conversation text and initial prompt arguments", () => {
  it("normalizes CRLF, controls and surrounding whitespace identically for delivery and matching", () => {
    expect(conversationText("  first\r\nsecond\rthird\x00\x03\x1b\x7f\tlast  ")).toBe("first\nsecond\nthird\tlast");
    expect(conversationText(" \r\n\x00 ")).toBe("");
  });
  it.each(["claude", "codex", "pi"])("ends %s options before the single literal prompt", (preset) => {
    expect(initialPromptArgs(preset, "- a\n--model other")).toEqual(["--", "- a\n--model other"]);
    expect(initialPromptArgs(preset)).toEqual([]);
  });
  it("keeps pi's @ text out of file arguments without changing the normalized request", () => {
    const args = initialPromptArgs("pi", "@not-a-file explain this");
    expect(args).toEqual(["--", " @not-a-file explain this"]);
    expect(conversationText(args[1])).toBe("@not-a-file explain this");
    expect(initialPromptArgs("claude", "@literal")).toEqual(["--", "@literal"]);
  });
});
describe("session input fields", () => {
  it.each(presets)("accepts preset %s and an optional cwd", (preset) => {
    expect(sessionInputFields({ preset }, presets)).toEqual({ ok: true, preset });
    expect(sessionInputFields({ preset, cwd: "/project" }, presets)).toEqual({ ok: true, preset, cwd: "/project" });
  });
  it.each([null, [], "shell", {}, { preset: "bash" }, { preset: "shell", cwd: 1 }])("rejects malformed input %j", (input) => {
    expect(sessionInputFields(input, presets).ok).toBe(false);
  });
  it("never accepts commands or environment from the client", () => {
    expect(sessionInputFields({ preset: "shell", command: "evil", env: { SHELL: "evil" } }, presets)).toEqual({ ok: true, preset: "shell" });
  });
});

describe("dimensions", () => {
  it("accepts bounded integer sizes", () => {
    expect(dimensions(2, 2)).toEqual({ cols: 2, rows: 2 });
    expect(dimensions(500, 300)).toEqual({ cols: 500, rows: 300 });
  });
  it.each([[1, 24], [80, 301], [501, 24], [80.5, 24], ["80", 24], [80, NaN]])(
    "rejects invalid size %s x %s", (cols, rows) => { expect(dimensions(cols, rows)).toBeUndefined(); },
  );
});

const ascii = (text: string) => Uint8Array.from([...text].map((character) => character.charCodeAt(0)));
describe("retained output boundary", () => {
  it("keeps ordered output up to 256KB", () => {
    expect(outputStart(ascii("firstsecond"))).toBe(0);
    expect(outputStart(new Uint8Array(OUTPUT_LIMIT))).toBe(0);
    expect(outputStart(new Uint8Array(OUTPUT_LIMIT + 3))).toBe(3);
  });
  it("drops a partial ANSI line after overflow", () => {
    const bytes = ascii("\x1b[31m" + "x".repeat(OUTPUT_LIMIT - 9) + "\nSAFE\n");
    expect([...bytes.slice(outputStart(bytes))]).toEqual([...ascii("SAFE\n")]);
  });
  it("keeps lines without overflow and falls back without a newline", () => {
    expect(outputStart(ascii("first\nsecond\n"))).toBe(0);
    expect(outputStart(ascii("\x1b[31m" + "x".repeat(OUTPUT_LIMIT - 3)))).toBe(2);
    expect(outputStart(ascii("x".repeat(OUTPUT_LIMIT) + "\n"))).toBe(OUTPUT_LIMIT + 1);
  });
  it("skips continuation bytes of a split UTF-8 character", () => {
    const bytes = new Uint8Array(OUTPUT_LIMIT + 4).fill(0x61);
    bytes.set([0xe3, 0x81, 0x82], 3); // cutoff=4 is inside あ.
    bytes.set([0xf0, 0x9f, 0x98, 0x80], bytes.length - 4); // 😀 remains whole.
    expect(outputStart(bytes)).toBe(6);
    expect(bytes.slice(outputStart(bytes)).length).toBeLessThanOrEqual(OUTPUT_LIMIT);
    expect([...bytes.slice(-4)]).toEqual([0xf0, 0x9f, 0x98, 0x80]);
  });
});
