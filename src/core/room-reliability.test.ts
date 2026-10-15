import { describe, expect, it } from "vitest";
import { Room } from "./room";
import { stopRequestAfterEvent, waitingAfterEvent } from "./session-actions";
import type { AgentEvent } from "./events";

const helper = (hook: string): AgentEvent => ({ state: "working", agent: "hero", hook, subagent: { id: "helper" }, tool: "Read" });

describe("finished helpers", () => {
  it.each([2, 3, 4])("does not revive a finished helper on tool arrival at %i", (at) => {
    const room = new Room();
    room.apply(helper("SubagentStart"), 1);
    room.apply(helper("SubagentStop"), 3);
    expect(room.apply(helper("PreToolUse"), at)!.helpers).toEqual([]);
  });
  it("ignores a late or same-clock start; only an explicit newer start reuses an ID", () => {
    const room = new Room();
    room.apply(helper("SubagentStop"), 3);
    for (const at of [1, 3]) expect(room.apply(helper("SubagentStart"), at)!.helpers).toEqual([]);
    expect(room.apply(helper("SubagentStart"), 4)!.helpers).toHaveLength(1);
  });
  it("keeps at most 256 finish clocks and forgets them on main SessionEnd", () => {
    const room = new Room();
    for (let i = 0; i < 300; i++) room.apply({ ...helper("SubagentStop"), subagent: { id: String(i) } }, i);
    for (let i = 44; i < 300; i++) expect(room.apply({ ...helper("PreToolUse"), subagent: { id: String(i) } }, i)!.helpers).toEqual([]);
    // The oldest finish clocks leave the bounded late-arrival window.
    expect(room.apply({ ...helper("PreToolUse"), subagent: { id: "0" } }, 0)!.helpers).toHaveLength(1);
    room.apply({ state: "idle", agent: "hero", hook: "SessionEnd" }, 400);
    expect(room.apply(helper("SubagentStart"), 500)!.helpers).toHaveLength(1);
  });
});

describe("stop requests", () => {
  it("preserves the battle until a subsequent main ready hook", () => {
    const room = new Room();
    room.apply({ state: "working", agent: "hero", hook: "PreToolUse", tool: "Bash", target: "sleep 60" }, 10);
    const agent = room.apply({ state: "working", agent: "hero", hook: "Interrupt" }, 20)!;
    expect(agent).toMatchObject({ activity: "run", running: true, stopRequestedAt: 20 });
    room.apply({ state: "idle", agent: "hero", hook: "Stop" }, 19);
    room.apply({ state: "idle", agent: "hero", hook: "SessionEnd" }, 19);
    expect(room.agents.get("hero")).toBe(agent);
    room.apply({ state: "idle", agent: "hero", hook: "Stop", subagent: { id: "other" } }, 21);
    expect(agent.stopRequestedAt).toBe(20);
    room.apply({ state: "idle", agent: "hero", hook: "Stop" }, 22);
    expect(agent).toMatchObject({ activity: "idle", running: false });
    expect(agent.stopRequestedAt).toBeUndefined();
  });
  it("accepts an explicit stop confirmation but not from an old or helper hook", () => {
    const room = new Room();
    room.apply({ state: "working", agent: "hero", hook: "PreToolUse", tool: "Bash" }, 10);
    const agent = room.apply({ state: "working", agent: "hero", hook: "Interrupt" }, 20)!;
    room.apply({ state: "idle", agent: "hero", hook: "InterruptConfirmed" }, 19);
    room.apply({ state: "idle", agent: "hero", hook: "InterruptConfirmed", subagent: { id: "helper" } }, 21);
    expect(agent.stopRequestedAt).toBe(20);
    room.apply({ state: "idle", agent: "hero", hook: "InterruptConfirmed" }, 22);
    expect(agent).toMatchObject({ activity: "idle", running: false });
    expect(agent.stopRequestedAt).toBeUndefined();
  });
  it("does not treat Esc, tool progress, notifications, or a new prompt as a confirmed stop", () => {
    expect(waitingAfterEvent({ state: "working", hook: "Interrupt" })).toBe(false);
    expect(waitingAfterEvent({ state: "idle", hook: "InterruptConfirmed" })).toBe(true);
    for (const hook of ["Notification", "PostToolUse", "PostToolUseFailure", "UserPromptSubmit"]) {
      expect(stopRequestAfterEvent(20, { state: "idle", hook }, 21)).toBe(20);
    }
    for (const hook of ["Stop", "StopFailure", "SessionStart", "PostCompact", "SessionEnd", "InterruptConfirmed"]) {
      expect(stopRequestAfterEvent(20, { state: "idle", hook }, 21)).toBeUndefined();
    }
  });
});
