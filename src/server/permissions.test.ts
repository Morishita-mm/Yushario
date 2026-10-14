import { afterEach, describe, expect, it, vi } from "vitest";
import { PermissionWaiter, PERMISSION_TIMEOUT_MS, permissionOutput, permissionSummary } from "./permissions";

const request = { type: "permission" as const, id: "first", tool: "Bash", summary: "Bash: date", content: "date", omitted: 0, expiresAt: Date.now() + PERMISSION_TIMEOUT_MS };
afterEach(() => vi.useRealTimers());

describe("PermissionWaiter", () => {
  it.each(["allow", "deny", "terminal"] as const)("settles %s only for a valid ID and decision", async (decision) => {
    const waiter = new PermissionWaiter();
    const result = waiter.wait(request, true);
    expect(waiter.decide("stale", decision)).toBe(false);
    expect(waiter.decide(request.id, "unknown")).toBe(false);
    expect(waiter.decide(request.id, { toString: () => "allow" })).toBe(false);
    expect(waiter.decide(request.id, decision)).toBe(true);
    expect(await result).toBe(decision);
    expect(waiter.pending).toEqual([]);
    expect(waiter.decide(request.id, decision)).toBe(false);
  });
  it("returns no decision immediately with no web connection", async () => {
    const waiter = new PermissionWaiter();
    expect(await waiter.wait(request, false)).toBe("terminal");
    expect(waiter.pending).toEqual([]);
  });
  it("times out to the terminal", async () => {
    vi.useFakeTimers();
    const waiter = new PermissionWaiter();
    const result = waiter.wait({ ...request, expiresAt: Date.now() + PERMISSION_TIMEOUT_MS }, true);
    await vi.advanceTimersByTimeAsync(PERMISSION_TIMEOUT_MS);
    expect(await result).toBe("terminal");
    expect(waiter.pending).toEqual([]);
  });
  it.each([
    { state: "working" as const, tool: "Bash", detail: "Tool completed" },
    { state: "error" as const, tool: "Bash" },
    { state: "success" as const, hook: "Stop" },
  ])("clears a terminal-answered request on Claude progress $state", async (event) => {
    const waiter = new PermissionWaiter();
    const result = waiter.wait(request, true);
    waiter.observe({ ...event, source: "claude-code" });
    expect(await result).toBe("terminal");
    expect(waiter.pending).toEqual([]);
  });
  it("ignores unrelated tools, PreToolUse, waiting_input and other sources", async () => {
    const waiter = new PermissionWaiter();
    const result = waiter.wait(request, true);
    for (const event of [
      { state: "working" as const, tool: "Read", detail: "Tool completed", source: "claude-code" },
      { state: "error" as const, tool: "Read", source: "claude-code" },
      { state: "working" as const, tool: "Bash", detail: "Tool activity", source: "claude-code" },
      { state: "waiting_input" as const, source: "claude-code" },
      { state: "success" as const, source: "pi", hook: "Stop" },
    ]) waiter.observe(event);
    expect(waiter.pending).toEqual([request]);
    waiter.cancel();
    expect(await result).toBe("terminal");
  });
  it("only clears on progress from the requesting session and subagent", async () => {
    const waiter = new PermissionWaiter();
    const scoped = { ...request, agent: "s1", helper: "h1" };
    const result = waiter.wait(scoped, true);
    for (const event of [
      { state: "success" as const, hook: "Stop", agent: "s2" },
      { state: "working" as const, tool: "Bash", detail: "Tool completed", agent: "s1" },
      { state: "working" as const, tool: "Bash", detail: "Tool completed", agent: "s1", subagent: { id: "h2" } },
      { state: "success" as const, hook: "Stop", agent: "s1", subagent: { id: "h1" } },
    ]) waiter.observe({ ...event, source: "claude-code" });
    expect(waiter.pending).toEqual([scoped]);
    waiter.observe({ state: "error", tool: "Bash", agent: "s1", subagent: { id: "h1" }, source: "claude-code" });
    expect(await result).toBe("terminal");
    const stopped = waiter.wait(scoped, true);
    waiter.observe({ state: "success", hook: "Stop", agent: "s1", source: "claude-code" });
    expect(await stopped).toBe("terminal");
  });
  it("keeps independent calls and can cancel all on disconnect", async () => {
    const waiter = new PermissionWaiter();
    const first = waiter.wait(request, true);
    const second = waiter.wait({ ...request, id: "second" }, true);
    expect(waiter.pending.map((item) => item.id)).toEqual(["first", "second"]);
    waiter.decide("second", "deny");
    expect(await second).toBe("deny");
    expect(waiter.pending).toEqual([request]);
    waiter.cancel();
    expect(await first).toBe("terminal");
  });
});

it("returns Claude Code's hookSpecificOutput envelope or no judgment", () => {
  expect(permissionOutput("allow")).toEqual({ hookSpecificOutput: {
    hookEventName: "PermissionRequest", decision: { behavior: "allow" },
  } });
  expect(permissionOutput("deny")).toEqual({ hookSpecificOutput: {
    hookEventName: "PermissionRequest", decision: { behavior: "deny", message: "キャラクター画面で拒否されました" },
  } });
  expect(permissionOutput("terminal")).toEqual({});
});

it("keeps command/path displays separate from short local summaries", () => {
  expect(permissionSummary({ hook_event_name: "PermissionRequest", tool_name: "Bash",
    tool_input: { command: "x".repeat(200), secret: "private" } })).toEqual({ tool: "Bash", summary: `Bash: ${"x".repeat(120)}`, content: "x".repeat(200), omitted: 0 });
  expect(permissionSummary({ hook_event_name: "PermissionRequest", tool_name: "Edit",
    tool_input: { file_path: "/tmp/example", new_string: "private" } })?.summary).toBe("Edit: /tmp/example");
  expect(permissionSummary({ hook_event_name: "Stop", tool_name: "Bash" })).toBeUndefined();
});

it("attributes a request to its session, directory name and subagent", () => {
  expect(permissionSummary({ hook_event_name: "PermissionRequest", tool_name: "Read", session_id: "s1",
    cwd: "/Users/me/work/t12-vitals", agent_id: "h1", tool_input: { file_path: "a.ts" } })).toEqual({
    tool: "Read", summary: "Read: a.ts", content: "a.ts", omitted: 0, agent: "s1", name: "t12-vitals", helper: "h1",
  });
});
