import { describe, expect, it } from "vitest";
import { appendOutput, OUTPUT_LIMIT, sessionInput } from "./pty-session";

// Node-boundary exceptions: node:path semantics and Buffer encoding/mode handoff.
// Field validation, dimensions and retention cutoffs are tested in core.
describe("session path boundary", () => {
  it("uses Node absolute-path semantics", () => {
    expect(sessionInput({ preset: "shell", cwd: "/project" })).toEqual({ preset: "shell", cwd: "/project" });
    for (const cwd of ["", "relative/path"]) expect(() => sessionInput({ preset: "shell", cwd })).toThrow();
  });
});

describe("output retention", () => {
  it("encodes incoming chunks and preserves modes from discarded bytes", () => {
    const modes = new Map<number, boolean>();
    expect(appendOutput(Buffer.from("first"), "second").toString()).toBe("firstsecond");
    const output = appendOutput(Buffer.from("\x1b[?1049h\n"), "x".repeat(OUTPUT_LIMIT), modes);
    expect(output).toHaveLength(OUTPUT_LIMIT);
    expect(modes.get(1049)).toBe(true);
  });
  it("drops a partial CSI line after the byte cutoff, also across chunks", () => {
    const prefix = "\x1b[31m" + "x".repeat(OUTPUT_LIMIT - 9);
    const tail = "\nSAFE\n";
    // The byte cutoff is inside ESC[31m; do not replay its visible parameter fragment.
    expect(appendOutput(Buffer.alloc(0), prefix + tail).toString()).toBe("SAFE\n");
    expect(appendOutput(Buffer.from(prefix), tail).toString()).toBe("SAFE\n");
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
