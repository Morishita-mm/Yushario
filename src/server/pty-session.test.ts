import { describe, expect, it } from "vitest";
import { appendOutput, dimensions, OUTPUT_LIMIT, PRESETS, sessionInput } from "./pty-session";

describe("session input", () => {
  it.each(PRESETS)("accepts only preset %s with optional cwd", (preset) => {
    expect(sessionInput({ preset })).toEqual({ preset });
    expect(sessionInput({ preset, cwd: "/project" })).toEqual({ preset, cwd: "/project" });
  });
  it.each([null, [], "shell", {}, { preset: "bash" }, { preset: "shell", cwd: 1 }, { preset: "shell", cwd: "" }, { preset: "shell", cwd: "relative/path" }])(
    "rejects malformed creation input %j", (input) => { expect(() => sessionInput(input)).toThrow(); },
  );
  it("never takes commands or environment from the client", () => {
    expect(sessionInput({ preset: "shell", command: "evil", env: { SHELL: "evil" } })).toEqual({ preset: "shell" });
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

describe("output retention", () => {
  it("appends ordered output up to 256KB", () => {
    expect(appendOutput(Buffer.from("first"), "second").toString()).toBe("firstsecond");
    expect(appendOutput(Buffer.alloc(0), "x".repeat(OUTPUT_LIMIT))).toHaveLength(OUTPUT_LIMIT);
  });
  it("keeps only the newest bytes, including one oversized chunk", () => {
    const output = appendOutput(Buffer.from("old"), "x".repeat(OUTPUT_LIMIT) + "new");
    expect(output).toHaveLength(OUTPUT_LIMIT);
    expect(output.toString()).toBe("x".repeat(OUTPUT_LIMIT - 3) + "new");
  });
  it("drops a partial CSI line after the byte cutoff, also across chunks", () => {
    const prefix = "\x1b[31m" + "x".repeat(OUTPUT_LIMIT - 9);
    const tail = "\nSAFE\n";
    // The byte cutoff is inside ESC[31m; do not replay its visible parameter fragment.
    expect(appendOutput(Buffer.alloc(0), prefix + tail).toString()).toBe("SAFE\n");
    expect(appendOutput(Buffer.from(prefix), tail).toString()).toBe("SAFE\n");
  });
  it("keeps lines unchanged without overflow and falls back when no newline exists", () => {
    expect(appendOutput(Buffer.from("first\n"), "second\n").toString()).toBe("first\nsecond\n");
    const raw = "\x1b[31m" + "x".repeat(OUTPUT_LIMIT - 3);
    expect(appendOutput(Buffer.alloc(0), raw).toString()).toBe(raw.slice(2));
    expect(appendOutput(Buffer.alloc(0), "x".repeat(OUTPUT_LIMIT) + "\n")).toHaveLength(0);
  });
  it("trims at a UTF-8 boundary, counting bytes rather than characters", () => {
    const data = "あ".repeat(OUTPUT_LIMIT) + "😀";
    const output = appendOutput(Buffer.from("old"), data);
    expect(output.length).toBeLessThanOrEqual(OUTPUT_LIMIT);
    expect(output.toString()).not.toContain("�");
    expect(output.toString().endsWith("😀")).toBe(true);
    expect(Buffer.from(output.toString())).toEqual(output);
    expect(appendOutput(output, "next").toString().endsWith("😀next")).toBe(true);
  });
});
