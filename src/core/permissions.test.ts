import { describe, expect, it } from "vitest";
import { permissionCanDecide, permissionOutput, permissionProgress, permissionSummary, type Permission } from "./permissions";
import type { AgentEvent } from "./events";

const request: Permission = { type: "permission", terminal: "t1", id: "first", tool: "Bash", summary: "Bash: date", content: "date", omitted: 0, expiresAt: 120_000 };
describe("permission decisions", () => {
  it.each(["allow", "deny", "terminal"])("accepts %s only before its deadline", (decision) => {
    expect(permissionCanDecide(request, decision, 119_999)).toBe(true);
    expect(permissionCanDecide(request, decision, 120_000)).toBe(false);
  });
  it.each(["unknown", null, { toString: () => "allow" }])("rejects invalid decision %j", (decision) => {
    expect(permissionCanDecide(request, decision, 0)).toBe(false);
  });
  it("never allows hidden input but can deny or return to the terminal", () => {
    const clipped = { ...request, omitted: 1 };
    expect(permissionCanDecide(clipped, "allow", 0)).toBe(false);
    expect(permissionCanDecide(clipped, "deny", 0)).toBe(true);
    expect(permissionCanDecide(clipped, "terminal", 0)).toBe(true);
  });
});

describe("permission progress", () => {
  it.each([
    { state: "working", tool: "Bash", detail: "Tool completed" },
    { state: "error", tool: "Bash" },
    { state: "success", hook: "Stop" },
    { state: "error", hook: "StopFailure" },
    { state: "idle", hook: "SessionEnd" },
  ] satisfies AgentEvent[])("recognizes progress $state / $hook", (event) => {
    expect(permissionProgress(request, { ...event, terminal: "t1", source: "claude-code" })).toBe(true);
  });
  it.each([
    { state: "working", tool: "Read", detail: "Tool completed", source: "claude-code" },
    { state: "error", tool: "Read", source: "claude-code" },
    { state: "working", tool: "Bash", detail: "Tool activity", source: "claude-code" },
    { state: "waiting_input", source: "claude-code" },
    { state: "success", source: "pi", hook: "Stop" },
  ] satisfies AgentEvent[])("ignores unrelated event %j", (event) => {
    expect(permissionProgress(request, { terminal: "t1", ...event })).toBe(false);
  });
  it("scopes progress to the requesting terminal and helper", () => {
    const scoped = { ...request, agent: "s1", helper: "h1" };
    for (const event of [
      { state: "success", hook: "Stop", terminal: "t2", agent: "s2" },
      { state: "working", tool: "Bash", detail: "Tool completed", agent: "s1" },
      { state: "working", tool: "Bash", detail: "Tool completed", agent: "s1", subagent: { id: "h2" } },
      { state: "success", hook: "Stop", agent: "s1", subagent: { id: "h1" } },
    ] satisfies AgentEvent[]) expect(permissionProgress(scoped, { terminal: "t1", source: "claude-code", ...event })).toBe(false);
    expect(permissionProgress(scoped, { state: "error", tool: "Bash", terminal: "t1", subagent: { id: "h1" }, source: "claude-code" })).toBe(true);
    expect(permissionProgress(scoped, { state: "success", hook: "Stop", terminal: "t1", source: "claude-code" })).toBe(true);
  });
});

it("returns Claude's hook envelope in either language, or no judgment", () => {
  expect(permissionOutput("allow")).toEqual({ hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } } });
  expect(permissionOutput("deny")).toEqual({ hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "deny", message: "キャラクター画面で拒否されました" } } });
  expect(permissionOutput("deny", "en")).toEqual({ hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "deny", message: "Denied on the hero screen" } } });
  expect(permissionOutput("terminal")).toEqual({});
});

it("keeps command/path displays separate from short local summaries", () => {
  expect(permissionSummary({ hook_event_name: "PermissionRequest", tool_name: "Bash", tool_input: { command: "x".repeat(200), secret: "private" } })).toEqual({ tool: "Bash", summary: `Bash: ${"x".repeat(120)}`, content: "x".repeat(200), omitted: 0 });
  expect(permissionSummary({ hook_event_name: "PermissionRequest", tool_name: "Edit", tool_input: { file_path: "/tmp/example", new_string: "private" } })?.summary).toBe("Edit: /tmp/example");
  expect(permissionSummary({ hook_event_name: "Stop", tool_name: "Bash" })).toBeUndefined();
  const long = permissionSummary({ hook_event_name: "PermissionRequest", tool_name: "Bash", tool_input: { command: "x".repeat(2001) } });
  expect(long?.content.length).toBe(2000); expect(long?.omitted).toBe(1);
  expect(permissionSummary({ hook_event_name: "PermissionRequest", tool_name: "Read" }, "en")?.content).toBe("Permission needed");
});

it("attributes requests to the session, directory name and helper", () => {
  expect(permissionSummary({ hook_event_name: "PermissionRequest", tool_name: "Read", session_id: "s1", cwd: "/Users/me/work/t12-vitals", agent_id: "h1", tool_input: { file_path: "a.ts" } })).toEqual({ tool: "Read", summary: "Read: a.ts", content: "a.ts", omitted: 0, agent: "s1", name: "t12-vitals", helper: "h1" });
});
