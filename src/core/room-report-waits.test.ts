import { describe, expect, it } from "vitest";
import type { AgentEvent } from "./events";
import { Room } from "./room";

const e = (event: Partial<AgentEvent>): AgentEvent => ({ state: "working", agent: "s1", ...event });
const prompt = (room: Room, at = 10) => room.apply(e({ hook: "UserPromptSubmit", text: "依頼" }), at)!;
const stop = (room: Room, at = 100) => room.apply(e({ hook: "Stop", text: "返事", state: "success" }), at)!;
const permission = (room: Room, at: number) =>
  room.apply(e({ hook: "PermissionRequest", state: "waiting_input", tool: "Bash" }), at);
const reportAt = (room: Room, at = 100) =>
  room.agents.get("s1")!.talk.find((entry) => entry.from === "hero" && entry.at === at)!.report!;

describe("Room report permission waits", () => {
  it("sums waits until the next main event without changing the report's boundaries", () => {
    const room = new Room();
    prompt(room);
    permission(room, 20);
    room.apply(e({ hook: "PostToolUse", tool: "Bash", target: "python3 -m pytest" }), 40);
    permission(room, 60);
    room.apply(e({ hook: "PreToolUse", tool: "Read" }), 90);
    stop(room);
    const report = reportAt(room);
    expect(report).toMatchObject({ startedAt: 10, endedAt: 100, waitedMs: 50 });
    expect(report.endedAt - report.startedAt - report.waitedMs!).toBe(40);
  });

  it.each(["Stop", "StopFailure"])("ends a final permission wait at %s", (hook) => {
    const room = new Room();
    prompt(room);
    permission(room, 20);
    room.apply(e({ hook, text: "返事" }), 100);
    expect(reportAt(room).waitedMs).toBe(80);
  });

  it("neither starts nor ends a wait on helper or other-session events", () => {
    const room = new Room();
    prompt(room);
    permission(room, 20);
    room.apply(e({ hook: "PermissionRequest", subagent: { id: "h1" } }), 25);
    room.apply(e({ hook: "PostToolUse", tool: "Read", subagent: { id: "h1" } }), 30);
    room.apply(e({ hook: "Stop", text: "helper reply", subagent: { id: "h1" } }), 35);
    room.apply(e({ hook: "PostToolUse", agent: "s2", tool: "Read" }), 40);
    room.apply(e({ hook: "PostToolUse", tool: "Read" }), 60);
    stop(room);
    expect(reportAt(room).waitedMs).toBe(40);
    prompt(room, 110);
    room.apply(e({ hook: "PermissionRequest", subagent: { id: "h1" } }), 120);
    stop(room, 150);
    expect(reportAt(room, 150)).not.toHaveProperty("waitedMs");
  });

  it("does not count permissions outside the round or ordinary input notifications", () => {
    const room = new Room();
    permission(room, 5);
    prompt(room);
    room.apply(e({ hook: "Notification", state: "waiting_input" }), 20);
    room.apply(e({ hook: "Notification", state: "idle" }), 60);
    permission(room, 110);
    stop(room);
    expect(reportAt(room)).not.toHaveProperty("waitedMs");
  });

  it("recomputes a completed card when permission and next-event hooks arrive late", () => {
    const room = new Room();
    prompt(room);
    stop(room);
    const report = reportAt(room);
    permission(room, 20);
    expect(report.waitedMs).toBe(80);
    room.apply(e({ hook: "PostToolUse", tool: "Read" }), 60);
    expect(reportAt(room)).toBe(report);
    expect(report.waitedMs).toBe(40);
    room.apply(e({ hook: "PostToolUse", tool: "Read" }), 40);
    expect(report.waitedMs).toBe(20);
  });

  it("handles a stop arriving before its prompt and permission", () => {
    const room = new Room();
    stop(room);
    room.apply(e({ hook: "PostToolUse", tool: "Read" }), 60);
    permission(room, 20);
    prompt(room);
    expect(reportAt(room).waitedMs).toBe(40);
  });

  it("does not double count consecutive permission requests", () => {
    const room = new Room();
    prompt(room);
    permission(room, 20);
    permission(room, 30);
    room.apply(e({ hook: "PostToolUse", tool: "Read" }), 50);
    stop(room);
    expect(reportAt(room).waitedMs).toBe(30);
  });

  it("allows zero-duration waits for events sharing a timestamp", () => {
    const room = new Room();
    prompt(room);
    permission(room, 20);
    room.apply(e({ hook: "PostToolUse", tool: "Read" }), 20);
    stop(room);
    expect(reportAt(room).waitedMs).toBe(0);
  });

  it("removes a stale wait when a late prompt changes a completed card's round", () => {
    const room = new Room();
    prompt(room);
    permission(room, 20);
    stop(room);
    const report = reportAt(room);
    expect(report.waitedMs).toBe(80);
    prompt(room, 50);
    expect(reportAt(room)).toBe(report);
    expect(report).not.toHaveProperty("waitedMs");
  });

  it("keeps waits scoped to retained rounds after old conversation marks are pruned", () => {
    const room = new Room();
    for (let i = 0; i < 20; i++) {
      const at = i * 100;
      prompt(room, at);
      permission(room, at + 10);
      room.apply(e({ hook: "PostToolUse", tool: "Read" }), at + 30);
      stop(room, at + 50);
    }
    const entries = room.agents.get("s1")!.talk;
    expect(entries).toHaveLength(30);
    expect(entries.filter((entry) => entry.from === "hero").every((entry) => entry.report?.waitedMs === 20)).toBe(true);
  });
});
