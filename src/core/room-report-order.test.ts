import { describe, expect, it } from "vitest";
import type { AgentEvent } from "./events";
import { Room } from "./room";

const e = (event: Partial<AgentEvent>): AgentEvent => ({ state: "working", agent: "s1", ...event });
const prompt = (room: Room, at: number, context?: number) =>
  room.apply(e({ hook: "UserPromptSubmit", text: "依頼", context }), at)!;
const stop = (room: Room, at: number) => room.apply(e({ hook: "Stop", text: "返事", state: "success" }), at)!;
const reportAt = (room: Room, at: number) => room.agents.get("s1")!.talk.find((entry) => entry.from === "hero" && entry.at === at)!.report!;

describe("Room report event-time ordering (R1)", () => {
  it("R1.1: Prompt(10), Pre/Edit(20), Stop(30), Post/Edit(21) updates the completed card", () => {
    const room = new Room();
    prompt(room, 10);
    room.apply(e({ hook: "PreToolUse", tool: "Edit", target: "a.ts" }), 20);
    stop(room, 30);
    const report = reportAt(room, 30);
    expect(report).toMatchObject({ kind: "scroll", files: [], tools: 1 });
    room.apply(e({ hook: "PostToolUse", tool: "Edit", target: "a.ts" }), 21);
    expect(reportAt(room, 30)).toBe(report);
    expect(report).toMatchObject({ kind: "chest", files: ["a.ts"], tools: 1, startedAt: 10, endedAt: 30 });
  });

  it("R1.2: new Prompt(50), Pre/Read(60), old Prompt(10), Stop(70) preserves the new round", () => {
    const room = new Room();
    prompt(room, 50);
    room.apply(e({ hook: "PreToolUse", tool: "Read" }), 60);
    prompt(room, 10);
    stop(room, 70);
    expect(reportAt(room, 70)).toMatchObject({ kind: "scroll", tools: 1, startedAt: 50, endedAt: 70 });
  });

  it("R1.3: new Prompt(50), Pre/Read(60), old SessionStart(0), Stop(70) preserves the new round", () => {
    const room = new Room();
    prompt(room, 50);
    room.apply(e({ hook: "PreToolUse", tool: "Read" }), 60);
    room.apply(e({ hook: "SessionStart" }), 0);
    stop(room, 70);
    expect(reportAt(room, 70)).toMatchObject({ kind: "scroll", tools: 1, startedAt: 50, endedAt: 70 });
  });

  it("R1.4: Prompt/.2(10), PostCompact/.6(50), old Pre/Read/.3(20), Stop(60) does not rewind MP", () => {
    const room = new Room();
    const agent = prompt(room, 10, 0.2);
    room.apply(e({ hook: "PostCompact", context: 0.6 }), 50);
    room.apply(e({ hook: "PreToolUse", tool: "Read", context: 0.3 }), 20);
    stop(room, 60);
    expect(agent.context).toBe(0.6);
    expect(reportAt(room, 60).mp).toEqual({ start: 0.8, end: 0.4 });
  });

  it.each(["Stop", "StopFailure"])("pairs %s arriving before its prompt, including earlier tool contributions and MP", (hook) => {
    const room = new Room();
    room.apply(e({ hook: "PreToolUse", tool: "Edit", target: "a.ts" }), 20);
    const agent = room.apply(e({ hook, text: "返事", context: 0.6 }), 30)!;
    expect(agent.talk[0]).not.toHaveProperty("report");
    room.apply(e({ hook: "PostToolUse", tool: "Edit", target: "a.ts" }), 21);
    prompt(room, 10, 0.2);
    expect(agent.talk.map((entry) => [entry.from, entry.at])).toEqual([["you", 10], ["hero", 30]]);
    expect(reportAt(room, 30)).toMatchObject({
      kind: "chest", files: ["a.ts"], tools: 1, startedAt: 10, endedAt: 30, mp: { start: 0.8, end: 0.4 },
    });
    expect(agent.context).toBe(0.6);
    expect(stop(room, 40).talk.at(-1)).not.toHaveProperty("report");
  });

  it("updates every completed-report counter without mixing a new round, gaps or helpers", () => {
    const room = new Room();
    prompt(room, 10);
    stop(room, 40);
    const first = reportAt(room, 40);
    prompt(room, 50);
    room.apply(e({ hook: "PreToolUse", tool: "Read" }), 60);
    const late: Partial<AgentEvent>[] = [
      { hook: "PreToolUse", tool: "Edit", target: "a.ts" },
      { hook: "PostToolUse", tool: "Edit", target: "a.ts" },
      { hook: "PreToolUse", tool: "Bash", target: "npm test" },
      { hook: "PostToolUse", tool: "Bash", target: "npm test" },
      { hook: "PreToolUse", tool: "Bash", target: "npm test" },
      { hook: "PostToolUseFailure", tool: "Bash", target: "npm test", state: "error" },
    ];
    late.forEach((event, index) => room.apply(e(event), 20 + index));
    room.apply(e({ hook: "PreToolUse", tool: "Read" }), 5);
    room.apply(e({ hook: "PreToolUse", tool: "Edit", target: "gap.ts" }), 45);
    room.apply(e({ hook: "PostToolUse", tool: "Edit", target: "gap.ts" }), 46);
    room.apply(e({ hook: "PostToolUse", tool: "Write", target: "helper.ts", subagent: { id: "h1" } }), 27);
    stop(room, 70);
    expect(reportAt(room, 40)).toBe(first);
    expect(first).toMatchObject({ kind: "chest", files: ["a.ts"], tools: 3, tests: { passed: 1, failed: 1 }, failures: 1 });
    expect(reportAt(room, 70)).toMatchObject({ kind: "scroll", files: [], tools: 1, failures: 0, startedAt: 50 });
  });

  it("attaches an old prompt to its earlier reply without replacing a newer pending round", () => {
    const room = new Room();
    stop(room, 30);
    prompt(room, 50);
    room.apply(e({ hook: "PreToolUse", tool: "Read" }), 60);
    prompt(room, 10);
    room.apply(e({ hook: "PreToolUse", tool: "Edit", target: "a.ts" }), 20);
    room.apply(e({ hook: "PostToolUse", tool: "Edit", target: "a.ts" }), 21);
    stop(room, 70);
    expect(reportAt(room, 30)).toMatchObject({ kind: "chest", files: ["a.ts"], tools: 1, startedAt: 10, endedAt: 30 });
    expect(reportAt(room, 70)).toMatchObject({ kind: "scroll", tools: 1, startedAt: 50, endedAt: 70 });
  });

  it("counts time-eligible tools that arrived before a delayed prompt", () => {
    const room = new Room();
    room.apply(e({ hook: "PreToolUse", tool: "Read" }), 5);
    room.apply(e({ hook: "PreToolUse", tool: "Edit", target: "a.ts" }), 20);
    room.apply(e({ hook: "PostToolUse", tool: "Edit", target: "a.ts" }), 21);
    prompt(room, 10);
    stop(room, 30);
    expect(reportAt(room, 30)).toMatchObject({ kind: "chest", files: ["a.ts"], tools: 1 });
  });

  it("respects a textless Stop arriving before its prompt", () => {
    const room = new Room();
    room.apply(e({ hook: "Stop" }), 30);
    prompt(room, 10);
    expect(stop(room, 40).talk.at(-1)).not.toHaveProperty("report");
  });

  it("excludes events after the stop time even when they arrive before Stop", () => {
    const room = new Room();
    prompt(room, 10);
    room.apply(e({ hook: "PreToolUse", tool: "Edit", target: "future.ts" }), 40);
    room.apply(e({ hook: "PostToolUse", tool: "Edit", target: "future.ts" }), 41);
    stop(room, 30);
    expect(reportAt(room, 30)).toMatchObject({ kind: "talk", files: [], tools: 0 });
  });

  it("keeps the MP observed at an early reply even after a later context update", () => {
    const room = new Room();
    room.apply(e({ hook: "Stop", text: "返事", context: 0.6 }), 30);
    room.apply(e({ hook: "PostCompact", context: 0.9 }), 50);
    prompt(room, 10, 0.2);
    expect(reportAt(room, 30).mp).toEqual({ start: 0.8, end: 0.4 });
    expect(room.agents.get("s1")!.context).toBe(0.9);
  });

  it("does not attach a stale prompt across a newer session boundary", () => {
    const room = new Room();
    room.apply(e({ hook: "SessionStart" }), 30);
    stop(room, 40);
    prompt(room, 10);
    expect(reportAt(room, 40)).toBeUndefined();
    expect(stop(room, 50).talk.at(-1)).not.toHaveProperty("report");
  });
});
