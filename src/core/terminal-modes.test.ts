import { describe, expect, it } from "vitest";
import { modePrefix, updateModes, type TerminalModes } from "./terminal-modes";

describe("terminal modes", () => {
  it("replays the alternate screen and mouse reporting a full-screen CLI turned on", () => {
    const modes: TerminalModes = new Map();
    updateModes(modes, "\x1b[?1049h\x1b[?25l\x1b[?1000h\x1b[?1006h\x1b[?2004hhello");
    expect(modePrefix(modes)).toBe("\x1b[?1049h\x1b[?25l\x1b[?1000h\x1b[?1006h\x1b[?2004h");
  });

  it("keeps the last setting and omits modes back at their default", () => {
    const modes: TerminalModes = new Map();
    updateModes(modes, "\x1b[?1049h\x1b[?1000;1006h");
    updateModes(modes, "\x1b[?1049l\x1b[?1000l");
    expect(modePrefix(modes)).toBe("\x1b[?1006h");
  });

  it("ignores synchronized output and unknown modes", () => {
    const modes: TerminalModes = new Map();
    updateModes(modes, "\x1b[?2026h\x1b[?9999h\x1b[1;2H");
    expect(modePrefix(modes)).toBe("");
  });
});
