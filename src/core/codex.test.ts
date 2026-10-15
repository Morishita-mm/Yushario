import { describe, expect, it } from "vitest";
import { codexEvent } from "./codex";
import { evidenceChecks } from "./checks";
import { Room } from "./room";
import { narrate } from "./story";
import { waitingAfterEvent } from "./session-actions";

const base = { session_id: "019c1234-1234-7123-8123-123456789abc", cwd: "/workspace/quest", transcript_path: "/private/never-read" };
const environment = { terminal: "terminal-1", project: "/workspace/.git" };
function event(hook_event_name: string, extra: Record<string, unknown> = {}) {
  return codexEvent({ ...base, hook_event_name, ...extra }, environment, 100)!;
}

describe("Codex official lifecycle hook conversion", () => {
  it("converts start, prompt, reply, end and authenticated routing metadata", () => {
    expect(event("SessionStart", { source: "startup" })).toMatchObject({ source: "codex", agent: base.session_id,
      terminal: "terminal-1", project: environment.project, name: "quest", hook: "SessionStart", state: "idle", ts: 100 });
    expect(event("UserPromptSubmit", { prompt: "Test this", turn_id: "turn-1" })).toMatchObject({ state: "thinking", text: "Test this" });
    expect(event("Stop", { last_assistant_message: "Done", stop_hook_active: false })).toMatchObject({ state: "success", text: "Done" });
    expect(event("SessionEnd", { reason: "other" }).state).toBe("idle");
  });
  it("shows commands and permission waits without making a permission decision", () => {
    const tool = { tool_name: "Bash", tool_input: { command: "npm test --token=secret", description: "private reason" } };
    expect(event("PreToolUse", tool)).toMatchObject({ tool: "Bash", target: "npm test", state: "working" });
    const permission = event("PermissionRequest", tool);
    expect(permission).toMatchObject({ hook: "PermissionRequest", state: "waiting_input" });
    expect(waitingAfterEvent(permission)).not.toBe(true);
    expect(JSON.stringify(permission)).not.toContain("secret");
    expect(JSON.stringify(permission)).not.toContain("private reason");
  });
  it("does not invent exit status from raw stdout, output text, or undocumented JSON fields", () => {
    for (const tool_response of ["post-tool-output", "Process exited with code 0", { exit_code: 0 }, { success: false }]) {
      const completed = event("PostToolUse", { tool_name: "Bash", tool_input: { command: "npm test" }, tool_response });
      expect(completed).toMatchObject({ hook: "PostToolUse", state: "working", detail: "Tool finished; result unknown" });
      expect(completed.command).toBeUndefined();
      expect(evidenceChecks(completed, [{ id: "test", name: "test", command: "npm test" }])).toBeUndefined();
      expect(completed).not.toHaveProperty("tool_response");
      expect(narrate(completed, undefined, "en")).toContain("Result unknown");
      expect(narrate(completed)).toContain("成否は ふめい");
    }
  });
  it("counts activity but never awards unknown tests, wins, edits or a victory chest", () => {
    const room = new Room();
    room.apply(event("UserPromptSubmit", { prompt: "Run tests" }), 1);
    room.apply(event("PreToolUse", { tool_name: "Bash", tool_input: { command: "npm test" } }), 2);
    room.apply(event("PostToolUse", { tool_name: "Bash", tool_input: { command: "npm test" }, tool_response: "passed" }), 3);
    room.apply(event("Stop", { last_assistant_message: "Tests finished" }), 4);
    const hero = room.agents.get(base.session_id)!;
    expect(hero.source).toBe("codex");
    expect(hero.wins).toBe(0);
    expect(hero.log.every((entry) => entry.outcome === undefined)).toBe(true);
    expect(hero.talk[1].report).toMatchObject({ tools: 1, kind: "scroll", tests: { passed: 0, failed: 0 }, files: [] });
  });
  it("observes manual compaction and interrupt, but never treats automatic compaction as idle", () => {
    expect(event("Interrupt", { turn_id: "turn-1" })).toMatchObject({ hook: "InterruptConfirmed", state: "idle", detail: "Interrupted" });
    expect(waitingAfterEvent(event("Interrupt"), true)).toBe(true);
    expect(event("PreCompact", { trigger: "manual" }).state).toBe("working");
    expect(event("PostCompact", { trigger: "manual" }).state).toBe("idle");
    expect(event("SessionStart", { source: "compact" })).toBeUndefined();
    expect(event("PreCompact", { trigger: "auto" })).toBeUndefined();
    expect(event("PostCompact", { trigger: "auto" })).toBeUndefined();
  });
  it("rejects unknown hooks and malformed inputs, bounds text, and never reads transcript usage", () => {
    expect(codexEvent(null, {}, 1)).toBeUndefined();
    expect(codexEvent({ hook_event_name: "Stop" }, {}, 1)).toBeUndefined();
    expect(event("Notification")).toBeUndefined();
    expect(event("Stop", { last_assistant_message: "x".repeat(9000), context: 0.4 })).toMatchObject({ text: "x".repeat(8000) });
    expect(event("Stop").context).toBeUndefined();
    expect(event("PostToolUse", { tool_name: "apply_patch", tool_input: { command: "private patch" }, tool_response: "Success" }).target).toBeUndefined();
  });
});
