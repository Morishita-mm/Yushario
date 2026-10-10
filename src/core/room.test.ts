import { describe, expect, it } from "vitest";
import type { AgentEvent } from "./events";
import { MOOD_RULES, Room, moods } from "./room";

const a = (event: Omit<AgentEvent, "agent" | "state"> & { state?: AgentEvent["state"] }): AgentEvent =>
  ({ state: "working", agent: "s1", name: "t12-vitals", ...event });
const pre = (tool: string, target?: string): AgentEvent => a({ hook: "PreToolUse", tool, target });
const post = (tool: string, target?: string): AgentEvent => a({ hook: "PostToolUse", tool, target });
const fail = (tool: string): AgentEvent => a({ hook: "PostToolUseFailure", tool, state: "error" });

describe("Room", () => {
  it("adds one character per session and removes it on SessionEnd", () => {
    const room = new Room();
    room.apply(a({ hook: "SessionStart", state: "idle" }), 0);
    room.apply({ state: "idle", hook: "SessionStart", agent: "s2", name: "t1-core" }, 0);
    expect([...room.agents.values()].map((agent) => agent.name)).toEqual(["t12-vitals", "t1-core"]);
    expect(room.apply(a({ hook: "SessionEnd", state: "idle" }), 1)).toBeUndefined();
    expect([...room.agents.keys()]).toEqual(["s2"]);
  });

  it("joins a session already running when its first event arrives", () => {
    const agent = new Room().apply(pre("Read", "motion.ts"), 5)!;
    expect(agent).toMatchObject({ name: "t12-vitals", activity: "read", target: "motion.ts", since: 5, running: true });
  });

  it("keeps the latest terminal/project values", () => {
    const room = new Room();
    const agent = room.apply(a({ terminal: "pty1", project: "repo" }), 10)!;
    expect(agent).toMatchObject({ terminal: "pty1", project: "repo" });
    room.apply(a({ terminal: "pty2", project: "next" }), 20);
    room.apply(post("Read"), 30);
    expect(agent).toMatchObject({ terminal: "pty2", project: "next" });
    const external = room.apply({ state: "idle", agent: "external", project: "repo" }, 40)!;
    expect(external.terminal).toBeUndefined();
    expect(external.project).toBe("repo");
  });

  it("records prompt and final reply text with their speaker and time", () => {
    const room = new Room();
    const agent = room.apply(a({ hook: "SessionStart", state: "idle" }), 0)!;
    expect(agent.talk).toEqual([]);
    room.apply(a({ hook: "UserPromptSubmit", state: "thinking", text: "こんにちは" }), 10);
    room.apply(a({ hook: "Stop", state: "success", text: "こんにちは！" }), 20);
    room.apply(a({ hook: "PostToolUse", tool: "Read", text: "not conversation" }), 30);
    room.apply(a({ hook: "Stop", state: "success" }), 40);
    expect(agent.talk).toEqual([
      { at: 10, from: "you", text: "こんにちは" },
      { at: 20, from: "hero", text: "こんにちは！", report: {
        kind: "talk", files: [], tests: { passed: 0, failed: 0 }, failures: 0, tools: 0, startedAt: 10, endedAt: 20,
      } },
    ]);
    expect(room.apply({ state: "success", agent: "s2", hook: "Stop", text: "another hero" }, 50)!.talk)
      .toEqual([{ at: 50, from: "hero", text: "another hero" }]);
    expect(agent.talk).toHaveLength(2);
  });

  it("keeps the most recent 30 talk entries in event-time order, including replay", () => {
    const room = new Room();
    for (let i = 0; i < 35; i++) {
      room.apply(a({ hook: i % 2 ? "Stop" : "UserPromptSubmit", text: String(i) }), i);
    }
    room.apply(a({ hook: "Stop", text: "late old event" }), 2);
    const agent = room.agents.get("s1")!;
    expect(agent.talk).toHaveLength(30);
    expect(agent.talk[0]).toMatchObject({ at: 5, from: "hero", text: "5", report: { startedAt: 4, endedAt: 5 } });
    expect(agent.talk.at(-1)).toEqual({ at: 34, from: "you", text: "34" });
    room.apply(a({ hook: "SessionEnd", state: "idle" }), 40);
    expect(room.apply(a({ hook: "SessionStart", state: "idle" }), 50)!.talk).toEqual([]);
  });

  it("keeps the activity after a tool finishes and stops the running clock", () => {
    const room = new Room();
    room.apply(pre("Edit", "room.ts"), 0);
    const agent = room.apply(post("Edit", "room.ts"), 10)!;
    expect(agent).toMatchObject({ activity: "edit", target: "room.ts", running: false });
    expect(agent.log).toEqual([{ at: 0, activity: "edit", target: "room.ts", outcome: "ok" }]);
  });

  it("ignores an older event that arrives after a newer one", () => {
    const room = new Room();
    room.apply(pre("Bash", "npm test"), 20);
    const agent = room.apply(pre("Read", "a.ts"), 10)!;
    expect(agent.activity).toBe("test");
    // A PostToolUse that overtook its PreToolUse leaves the tool finished.
    room.apply(post("Grep"), 40);
    expect(room.apply(pre("Grep"), 30)!.running).toBe(false);
  });

  it("restarts the activity clock when the target changes", () => {
    const room = new Room();
    room.apply(pre("Read", "a.ts"), 0);
    expect(room.apply(pre("Read", "a.ts"), 5)!.since).toBe(0);
    expect(room.apply(pre("Read", "b.ts"), 9)!.since).toBe(9);
  });

  it("treats an interrupted tool as idle, not as a failure", () => {
    const room = new Room();
    room.apply(pre("Bash", "npm test"), 0);
    const agent = room.apply(a({ hook: "PostToolUseFailure", tool: "Bash", target: "npm test", state: "idle" }), 1)!;
    expect(agent.activity).toBe("idle");
    expect(agent.failures).toEqual([]);
  });

  it("tracks helpers separately while the parent delegates", () => {
    const room = new Room();
    room.apply(pre("Agent", "general-purpose"), 0);
    room.apply(a({ hook: "SubagentStart", subagent: { id: "h1", type: "general-purpose" } }), 1);
    const agent = room.apply(a({ hook: "PreToolUse", tool: "Read", target: "README.md", subagent: { id: "h1" } }), 2)!;
    expect(agent.activity).toBe("delegate");
    expect(agent.running).toBe(true);
    expect(agent.helpers).toEqual([{ id: "h1", type: "general-purpose", activity: "read", target: "README.md" }]);
    room.apply(a({ hook: "PostToolUse", tool: "Read", subagent: { id: "h1" } }), 3);
    expect(agent.running).toBe(true);
    room.apply(a({ hook: "SubagentStop", subagent: { id: "h1" } }), 4);
    expect(agent.helpers).toEqual([]);
  });

  it("keeps the plan board from task events", () => {
    const room = new Room();
    room.apply(a({ hook: "TaskCreated", task: { id: "1", subject: "Write tests", status: "pending" } }), 0);
    room.apply(a({ hook: "TaskCreated", task: { id: "2", subject: "Ship", status: "pending" } }), 1);
    room.apply(a({ hook: "PreToolUse", tool: "TaskUpdate", task: { id: "1", status: "in_progress" } }), 2);
    room.apply(a({ hook: "TaskCompleted", task: { id: "1", subject: "Write tests", status: "completed" } }), 3);
    const agent = room.apply(a({ hook: "PreToolUse", tool: "TaskUpdate", task: { id: "2", status: "deleted" } }), 4)!;
    expect(agent.tasks).toEqual([{ id: "1", subject: "Write tests", status: "completed" }]);
    expect(agent.activity).toBe("plan");
  });

  it("caps the action log", () => {
    const room = new Room();
    for (let i = 0; i < 60; i++) room.apply(pre("Read", `f${i}.ts`), i);
    const agent = room.agents.get("s1")!;
    expect(agent.log).toHaveLength(50);
    expect(agent.log[0].target).toBe("f10.ts");
  });
});

describe("moods", () => {
  it("notices a long wait only while the tool is still running", () => {
    const room = new Room();
    const agent = room.apply(pre("Bash", "npm test"), 0)!;
    expect(moods(agent, MOOD_RULES.waitingMs - 1)).not.toContain("waiting_long");
    expect(moods(agent, MOOD_RULES.waitingMs)).toContain("waiting_long");
    room.apply(post("Bash", "npm test"), MOOD_RULES.waitingMs + 1);
    expect(moods(agent, MOOD_RULES.waitingMs + 2)).not.toContain("waiting_long");
  });

  it("struggles after repeated failures, then recovers on the next success", () => {
    const room = new Room();
    let agent = room.apply(fail("Bash"), 0)!;
    room.apply(fail("Bash"), 1000);
    expect(moods(agent, 1500)).not.toContain("struggling");
    room.apply(fail("Bash"), 2000);
    expect(moods(agent, 2500)).toContain("struggling");
    expect(moods(agent, 2000 + MOOD_RULES.struggleWindowMs)).not.toContain("struggling");
    agent = room.apply(post("Bash"), 3000)!;
    expect(moods(agent, 3000)).toEqual(expect.arrayContaining(["recovered"]));
    expect(moods(agent, 3000)).not.toContain("struggling");
    expect(moods(agent, 3000 + MOOD_RULES.recoveredMs)).not.toContain("recovered");
  });

  it("counts failures inside helpers toward the agent", () => {
    const room = new Room();
    for (let i = 0; i < 3; i++) {
      room.apply(a({ hook: "PostToolUseFailure", tool: "Bash", state: "error", subagent: { id: "h1" } }), i);
    }
    expect(moods(room.agents.get("s1")!, 10)).toContain("struggling");
  });

  it("flows with rapid successful edits and loses it on a failure", () => {
    const room = new Room();
    let agent = room.apply(post("Edit", "a.ts"), 0)!;
    for (let i = 1; i < MOOD_RULES.flowEdits; i++) agent = room.apply(post("Edit", "a.ts"), i * 1000)!;
    expect(moods(agent, 5000)).toContain("flowing");
    room.apply(fail("Bash"), 5500);
    expect(moods(agent, 6000)).not.toContain("flowing");
  });

  it("gets tired from context usage", () => {
    const room = new Room();
    const agent = room.apply(a({ hook: "Stop", state: "success", context: MOOD_RULES.tiredContext }), 0)!;
    expect(moods(agent, 0)).toContain("tired");
    room.apply(a({ hook: "SessionStart", state: "idle", context: 0.1 }), 1);
    expect(moods(agent, 1)).not.toContain("tired");
  });

  it("calls louder when left waiting, and dozes without events", () => {
    const room = new Room();
    const agent = room.apply(a({ hook: "Notification", state: "waiting_input" }), 0)!;
    expect(moods(agent, MOOD_RULES.callingMs)).toContain("calling_long");
    room.apply(a({ hook: "Stop", state: "success" }), 1);
    expect(moods(agent, MOOD_RULES.callingMs)).not.toContain("calling_long");
    expect(moods(agent, MOOD_RULES.dozingMs)).not.toContain("dozing");
    expect(moods(agent, MOOD_RULES.dozingMs + 1)).toContain("dozing");
  });
});
