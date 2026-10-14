import { describe, expect, it } from "vitest";
import { parseAgentEvent } from "./events";
import { checkCandidates, checkMark, commandMatchesCheck, evidenceChecks, latestCheckEvidence, validQuestCheck, type CheckEvidence } from "./checks";

const fingerprint = { head: "abc", changes: "123" };
const evidence: CheckEvidence = { command: "npm test", passed: true, at: 10, session: "terminal", checks: ["test"], fingerprint };
describe("quest check marks", () => {
  it("covers unrun, passed, stale and failed", () => {
    expect(checkMark(undefined, fingerprint)).toBe("unrun");
    expect(checkMark(evidence, { ...fingerprint })).toBe("passed");
    expect(checkMark(evidence, { ...fingerprint, changes: "changed" })).toBe("stale");
    expect(checkMark(evidence, { ...fingerprint, head: "new commit" })).toBe("stale");
    expect(checkMark({ ...evidence, passed: false }, fingerprint)).toBe("failed");
    expect(checkMark({ ...evidence, passed: false }, undefined)).toBe("failed");
  });
  it("never passes when either fingerprint is unknown", () => {
    expect(checkMark(evidence, undefined)).toBe("stale");
    expect(checkMark({ ...evidence, fingerprint: undefined }, fingerprint)).toBe("stale");
    expect(checkMark({ ...evidence, fingerprint: undefined }, undefined)).toBe("stale");
  });
  it("uses the latest matching evidence, even when fingerprint reads finish out of order", () => {
    const failed = { ...evidence, at: 30, passed: false };
    expect(latestCheckEvidence("test", [failed, evidence])).toEqual(failed);
    expect(latestCheckEvidence("build", [evidence])).toBeUndefined();
    expect(latestCheckEvidence("test", [evidence, { ...evidence, passed: false }])?.passed).toBe(false);
  });
});
describe("commands and check candidates", () => {
  it("accepts synthetic tool_input.command and bounds transient commands", () => {
    const event = parseAgentEvent({ state: "working", hook: "PostToolUse", tool: "Bash", tool_input: { command: "npm test" } });
    expect(event.ok && event.event.command).toBe("npm test");
    expect(event.ok && event.event.target).toBe("npm test");
    const large = parseAgentEvent({ state: "working", hook: "PostToolUse", tool: "Bash", command: "x".repeat(9000) });
    expect(large.ok && large.event.command?.length).toBe(8000);
    expect(parseAgentEvent({ state: "working", command: 12 }).ok).toBe(false);
  });
  it("matches a literal shape inside a longer command, not a regexp", () => {
    expect(commandMatchesCheck("cd app && npm   run build -- --mode production", "npm run build")).toBe(true);
    expect(commandMatchesCheck("npm run build", "npm run lint")).toBe(false);
    expect(commandMatchesCheck("npm test", "")).toBe(false);
    expect(commandMatchesCheck("echo abc", "a.*")).toBe(false);
  });
  it("only collects finished command tools and either explicit checks or classified tests", () => {
    const checks = [{ id: "build", name: "Build", command: "npm run build" }];
    expect(evidenceChecks({ state: "working", hook: "PostToolUse", tool: "Bash", command: "cd app && npm run build" }, checks)).toEqual(["build"]);
    expect(evidenceChecks({ state: "error", hook: "PostToolUseFailure", tool: "Bash", command: "CI=1 npm test" }, checks)).toEqual([]);
    expect(evidenceChecks({ state: "working", hook: "PostToolUse", tool: "Bash", target: "python3 -m pytest" }, checks)).toEqual([]);
    expect(evidenceChecks({ state: "working", hook: "PreToolUse", tool: "Bash", command: "npm test" }, checks)).toBeUndefined();
    expect(evidenceChecks({ state: "working", hook: "PostToolUse", tool: "Read", target: "npm test" }, checks)).toBeUndefined();
    expect(evidenceChecks({ state: "working", hook: "PostToolUse", tool: "Bash", command: "git status" }, checks)).toBeUndefined();
  });
  it("only offers the four allowed script names, never executes their values", () => {
    expect(checkCandidates({ scripts: { test: "anything", build: "rm -rf ignored", dev: "vite", lint: 42 } })).toEqual([
      { name: "test", command: "npm test" }, { name: "build", command: "npm run build" },
    ]);
    expect(checkCandidates(null)).toEqual([]);
    expect(checkCandidates({ scripts: [] })).toEqual([]);
    expect(validQuestCheck({ name: "Test", command: "npm test" })).toBe(true);
    expect(validQuestCheck({ name: "", command: "npm test" })).toBe(false);
    expect(validQuestCheck({ name: "Test", command: "npm test", run: true })).toBe(false);
  });
});
