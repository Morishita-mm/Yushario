import { describe, expect, it } from "vitest";
import { classifyActivity, commandActivity, toolActivity } from "./activity";

describe("activity classification", () => {
  it.each([
    ["Read", "read"], ["Grep", "search"], ["Glob", "search"], ["Edit", "edit"], ["Write", "edit"],
    ["WebFetch", "web"], ["WebSearch", "web"], ["TaskCreate", "plan"], ["TaskUpdate", "plan"],
    ["Agent", "delegate"], ["AskUserQuestion", "ask"], ["mcp__orca__list", "tool"], ["Skill", "tool"],
  ])("maps tool %s to %s", (tool, activity) => {
    expect(toolActivity(tool)).toBe(activity);
  });

  it.each([
    ["npm test", "test"], ["npm run test", "test"], ["npm run typecheck", "test"], ["npx vitest", "test"],
    ["pytest", "test"], ["go test", "test"], ["cargo test", "test"], ["git commit -m", "git"], ["gh pr", "git"],
    ["npm run build", "run"], ["ls", "run"], ["gitk", "run"], [undefined, "run"],
  ])("classifies command %s as %s", (head, activity) => {
    expect(commandActivity(head)).toBe(activity);
    expect(toolActivity("Bash", head)).toBe(activity);
  });

  it("derives activity from the hook, leaving unrelated hooks unchanged", () => {
    expect(classifyActivity({ state: "idle", hook: "SessionStart" })).toBe("idle");
    expect(classifyActivity({ state: "thinking", hook: "UserPromptSubmit" })).toBe("think");
    expect(classifyActivity({ state: "working", hook: "PreToolUse", tool: "Bash", target: "npm test" })).toBe("test");
    expect(classifyActivity({ state: "waiting_input", hook: "Notification" })).toBe("ask");
    expect(classifyActivity({ state: "working", hook: "PreCompact" })).toBe("rest");
    expect(classifyActivity({ state: "success", hook: "Stop" })).toBe("idle");
    expect(classifyActivity({ state: "idle", hook: "PostToolUseFailure", tool: "Bash" })).toBe("idle");
    expect(classifyActivity({ state: "error", hook: "PostToolUseFailure", tool: "Bash" })).toBeUndefined();
    expect(classifyActivity({ state: "working", hook: "PostToolUse", tool: "Read" })).toBeUndefined();
    expect(classifyActivity({ state: "working" })).toBeUndefined();
  });
});
