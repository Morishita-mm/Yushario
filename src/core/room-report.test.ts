import { describe, expect, it } from "vitest";
import type { AgentEvent } from "./events";
import { Room } from "./room";
import { stats } from "./story";

const e = (event: Partial<AgentEvent>): AgentEvent => ({ state: "working", agent: "s1", ...event });
const prompt = (room: Room, at = 10) => room.apply(e({ hook: "UserPromptSubmit", text: "依頼" }), at)!;
const stop = (room: Room, at = 100) => room.apply(e({ hook: "Stop", text: "返事", state: "success" }), at)!;
const reportOf = (room: Room) => room.agents.get("s1")!.talk.at(-1)!.report!;
function tool(room: Room, name: string, target: string | undefined, at: number, state: AgentEvent["state"] = "working") {
  room.apply(e({ hook: "PreToolUse", tool: name, target }), at);
  room.apply(e({ hook: state === "error" ? "PostToolUseFailure" : "PostToolUse", tool: name, target, state }), at + 1);
}

describe("Room talk reports", () => {
  it("reports a simple conversation without tools or guessed MP", () => {
    const room = new Room();
    const agent = prompt(room);
    stop(room);
    expect(agent.talk[0]).not.toHaveProperty("report");
    expect(reportOf(room)).toEqual({
      kind: "talk", files: [], tests: { passed: 0, failed: 0 }, failures: 0, tools: 0, startedAt: 10, endedAt: 100,
    });
  });

  it.each(["Read", "NotebookRead", "Grep", "Glob", "LS", "WebSearch", "WebFetch"])(
    "returns a scroll for research with %s and counts a tool only once", (name) => {
      const room = new Room();
      prompt(room);
      tool(room, name, "README.md", 20);
      stop(room);
      expect(reportOf(room)).toMatchObject({ kind: "scroll", tools: 1, files: [], tests: { passed: 0, failed: 0 } });
    },
  );

  it.each(["Edit", "MultiEdit", "Write", "NotebookEdit"])("returns a chest for %s and deduplicates edited files", (name) => {
    const room = new Room();
    prompt(room);
    tool(room, "Read", "untouched.ts", 20);
    tool(room, name, "a.ts", 30);
    tool(room, name, "a.ts", 40);
    tool(room, name, "b.ts", 50);
    stop(room);
    expect(reportOf(room)).toMatchObject({ kind: "chest", files: ["a.ts", "b.ts"], tools: 4 });
  });

  it("does not claim failed, interrupted or unfinished edits as changed files", () => {
    const room = new Room();
    prompt(room);
    tool(room, "Edit", "failed.ts", 20, "error");
    room.apply(e({ hook: "PreToolUse", tool: "Write", target: "interrupted.ts" }), 30);
    room.apply(e({ hook: "PostToolUseFailure", tool: "Write", target: "interrupted.ts", state: "idle" }), 31);
    room.apply(e({ hook: "PreToolUse", tool: "Edit", target: "unfinished.ts" }), 40);
    tool(room, "Write", undefined, 50);
    stop(room);
    expect(reportOf(room)).toMatchObject({ kind: "scroll", files: [], tools: 4, failures: 1 });
  });

  it.each(["npm test", "npm run typecheck", "npm run lint", "npx vitest", "pytest", "go test", "cargo test"])(
    "counts successful and failed test executions classified from %s", (command) => {
      const room = new Room();
      prompt(room);
      tool(room, "Bash", command, 20);
      tool(room, "Bash", command, 30, "error");
      // Tool-response errors can arrive on PostToolUse rather than PostToolUseFailure.
      room.apply(e({ hook: "PreToolUse", tool: "Bash", target: command }), 40);
      room.apply(e({ hook: "PostToolUse", tool: "Bash", target: command, state: "error" }), 41);
      stop(room);
      expect(reportOf(room)).toMatchObject({ kind: "scroll", tools: 3, tests: { passed: 1, failed: 2 }, failures: 2 });
    },
  );

  it.each(["npm run build", "git status", "gh pr"])("does not classify %s as a test", (command) => {
    const room = new Room();
    prompt(room);
    tool(room, "Bash", command, 20);
    stop(room);
    expect(reportOf(room)).toMatchObject({ kind: "scroll", tools: 1, tests: { passed: 0, failed: 0 } });
  });

  it("counts all failed tools but not interrupted tests or StopFailure itself", () => {
    const room = new Room();
    prompt(room);
    tool(room, "Read", "missing.ts", 20, "error");
    tool(room, "Bash", "npm test", 30, "error");
    room.apply(e({ hook: "PreToolUse", tool: "Bash", target: "npm test" }), 40);
    room.apply(e({ hook: "PostToolUseFailure", tool: "Bash", target: "npm test", state: "idle" }), 41);
    const agent = room.apply(e({ hook: "StopFailure", text: "実行できません", state: "error" }), 50)!;
    expect(agent.talk.at(-1)).toEqual({ at: 50, from: "hero", text: "実行できません", report: {
      kind: "scroll", files: [], tools: 3, tests: { passed: 0, failed: 1 }, failures: 2, startedAt: 10, endedAt: 50,
    } });
    expect(stop(room, 60).talk.at(-1)).not.toHaveProperty("report");
  });

  it("excludes every subagent event, including prompts, stops, tool outcomes and context", () => {
    const room = new Room();
    room.apply(e({ hook: "UserPromptSubmit", text: "依頼", context: 0.25 }), 10);
    const helper = { id: "h1", type: "Explore" };
    const events: Partial<AgentEvent>[] = [
      { hook: "SessionStart" },
      { hook: "UserPromptSubmit", text: "helper prompt", context: 0.9 },
      { hook: "PreToolUse", tool: "Write", target: "helper.ts" },
      { hook: "PostToolUse", tool: "Write", target: "helper.ts" },
      { hook: "PreToolUse", tool: "Bash", target: "npm test" },
      { hook: "PostToolUse", tool: "Bash", target: "npm test" },
      { hook: "PostToolUseFailure", tool: "Bash", target: "npm test", state: "error" },
      { hook: "Stop", text: "helper reply" },
      { hook: "StopFailure", text: "helper failed", state: "error" },
      { hook: "SessionEnd" },
    ];
    events.forEach((event, index) => room.apply(e({ ...event, subagent: helper }), 20 + index));
    stop(room);
    expect(room.agents.get("s1")!.talk.map((entry) => entry.text)).toEqual(["依頼", "返事"]);
    expect(reportOf(room)).toMatchObject({
      kind: "talk", files: [], tools: 0, tests: { passed: 0, failed: 0 }, failures: 0,
      startedAt: 10, mp: { start: 0.75, end: 0.75 },
    });
  });

  it.each(["Stop", "StopFailure"])("records a reply without a report when %s has no prompt", (hook) => {
    const room = new Room();
    tool(room, "Edit", "old.ts", 0);
    const agent = room.apply(e({ hook, text: "prompt not observed" }), 10)!;
    expect(agent.talk).toEqual([{ at: 10, from: "hero", text: "prompt not observed" }]);
  });

  it("starts a round even without prompt text", () => {
    const room = new Room();
    room.apply(e({ hook: "UserPromptSubmit" }), 10);
    tool(room, "Read", "a.ts", 20);
    const agent = stop(room);
    expect(agent.talk).toHaveLength(1);
    expect(reportOf(room)).toMatchObject({ kind: "scroll", startedAt: 10, tools: 1 });
  });

  it.each(["Stop", "StopFailure"])("closes on %s even without reply text", (hook) => {
    const room = new Room();
    prompt(room);
    tool(room, "Edit", "a.ts", 20);
    room.apply(e({ hook }), 30);
    expect(stop(room, 40).talk.at(-1)).not.toHaveProperty("report");
  });

  it("isolates rounds and does not mutate a completed report", () => {
    const room = new Room();
    prompt(room);
    tool(room, "Edit", "first.ts", 20);
    stop(room, 30);
    const first = reportOf(room);
    tool(room, "Write", "between.ts", 40);
    prompt(room, 50);
    tool(room, "Read", "second.ts", 60);
    stop(room, 70);
    expect(first).toMatchObject({ kind: "chest", files: ["first.ts"], tools: 1, startedAt: 10, endedAt: 30 });
    expect(reportOf(room)).toMatchObject({ kind: "scroll", files: [], tools: 1, startedAt: 50, endedAt: 70 });
  });

  it("keeps concurrent sessions separate", () => {
    const room = new Room();
    prompt(room);
    room.apply(e({ agent: "s2", hook: "UserPromptSubmit", text: "second" }), 11);
    tool(room, "Edit", "a.ts", 20);
    room.apply(e({ agent: "s2", hook: "Stop", text: "done" }), 30);
    stop(room, 40);
    expect(room.agents.get("s2")!.talk.at(-1)!.report).toMatchObject({ kind: "talk", tools: 0, startedAt: 11, endedAt: 30 });
    expect(reportOf(room)).toMatchObject({ kind: "chest", files: ["a.ts"], tools: 1 });
  });

  it.each(["SessionEnd", "SessionStart"])("discards an unfinished round on %s", (hook) => {
    const room = new Room();
    prompt(room);
    tool(room, "Edit", "a.ts", 20);
    room.apply(e({ hook }), 30);
    expect(stop(room, 40).talk.at(-1)).not.toHaveProperty("report");
  });

  it("does not let an old stop close the current round", () => {
    const room = new Room();
    prompt(room, 50);
    tool(room, "Read", "a.ts", 60);
    stop(room, 20);
    expect(stop(room, 70).talk.at(-1)!.report).toMatchObject({ startedAt: 50, endedAt: 70, tools: 1 });
  });

  it.each([[0.25, 0.75], [0, 1], [1, 0]])("uses 1-context for MP from %s to %s, matching story stats", (start, end) => {
    const room = new Room();
    const agent = room.apply(e({ hook: "UserPromptSubmit", text: "依頼", context: start }), 10)!;
    const startMP = stats(agent, 10).mp;
    room.apply(e({ hook: "Stop", text: "返事", context: end }), 20);
    expect(reportOf(room).mp).toEqual({ start: startMP, end: stats(agent, 20).mp });
  });

  it("uses the latest known main-session context at each boundary", () => {
    const room = new Room();
    room.apply(e({ hook: "SessionStart", context: 0.25 }), 0);
    prompt(room);
    room.apply(e({ hook: "PostCompact", context: 0.125 }), 20);
    stop(room);
    expect(reportOf(room).mp).toEqual({ start: 0.75, end: 0.875 });
  });

  it("omits MP if start context was unknown even when the stop supplies it", () => {
    const room = new Room();
    prompt(room);
    room.apply(e({ hook: "Stop", text: "返事", context: 0.5 }), 20);
    expect(reportOf(room)).not.toHaveProperty("mp");
  });
});
