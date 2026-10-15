import { describe, expect, it } from "vitest";
import { parseAgentEvent } from "./events";
import { checkBasePath, checkCandidates, checkMark, certainCheckCommand, commandMatchesCheck, evidenceChecks, latestCheckEvidence, validQuestCheck, type CheckEvidence } from "./checks";

const fingerprint = { head: "abc", changes: "123", base: "/work/base" };
const evidence: CheckEvidence = { command: "npm test", passed: true, at: 10, session: "terminal", base: fingerprint.base, checks: ["test"], fingerprint };
describe("quest check marks", () => {
  it("covers unrun, passed, stale and failed", () => {
    expect(checkMark(undefined, fingerprint)).toBe("unrun");
    expect(checkMark({ ...evidence, passed: undefined }, fingerprint)).toBe("unknown");
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
  it("never passes another base or legacy evidence without its base", () => {
    expect(checkMark(evidence, { ...fingerprint, base: "/other/base" })).toBe("stale");
    expect(checkMark({ ...evidence, base: "/other/base" }, fingerprint)).toBe("stale");
    expect(checkMark({ ...evidence, base: undefined }, fingerprint)).toBe("stale");
    expect(checkMark({ ...evidence, fingerprint: { head: "abc", changes: "123" } }, fingerprint)).toBe("stale");
  });
  it("uses the saved base, otherwise only the live writer in the same town", () => {
    const sessions = [{ id: "implement", cwd: "/main", project: "town" }, { id: "writer", cwd: "/base", project: "town" }];
    expect(checkBasePath({ town: "town", worktreePath: "/missing" }, "writer", sessions)).toBe("/missing");
    expect(checkBasePath({ town: "town" }, "writer", sessions)).toBe("/base");
    expect(checkBasePath({ town: "town" }, undefined, sessions)).toBeUndefined();
    expect(checkBasePath({ town: "town" }, "missing", sessions)).toBeUndefined();
    expect(checkBasePath({ town: "other" }, "writer", sessions)).toBeUndefined();
    expect(checkBasePath({ town: "town" }, "writer", [{ ...sessions[1], exited: { code: 0 } }])).toBeUndefined();
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
  it("matches simple command words at the command head, not a regexp", () => {
    expect(commandMatchesCheck("cd app && npm   run build -- --mode production", "npm run build")).toBe(true);
    expect(commandMatchesCheck("npm run build", "npm run lint")).toBe(false);
    expect(commandMatchesCheck("npm test", "")).toBe(false);
    expect(commandMatchesCheck("echo abc", "a.*")).toBe(false);
  });
  it.each(['echo "npm test"', '# npm test', 'true # npm test', 'echo "x && npm test"', 'echo x # hi; npm test', '$(npm test)', 'npm test > output'])
  ("does not certify quoted, commented or unsupported shell syntax: %s", (command) => {
    expect(commandMatchesCheck(command, "npm test")).toBe(false);
  });
  it("requires complete argument words and handles quotes, comments and environment assignments", () => {
    expect(commandMatchesCheck("npm run build-docs", "npm run build")).toBe(false);
    expect(commandMatchesCheck("CI=1 npm test -- --run", "npm test")).toBe(true);
    expect(commandMatchesCheck('npm run "build"', "npm run build")).toBe(true);
    expect(commandMatchesCheck("# no test\nnpm test", "npm test")).toBe(false);
    expect(commandMatchesCheck("echo 'unterminated && npm test", "npm test")).toBe(false);
    expect(commandMatchesCheck("npm test", "npm test && npm run build")).toBe(false);
  });
  it.each(['npm test || true', 'true || npm test', 'npm test; echo', 'npm test | tee x', '(npm test)', '$(npm test)', '`npm test`', 'npm test &', 'npm test\necho x', 'if npm test; then true; fi', 'npm test &&', 'exit 0 && npm test', 'exec true && npm test', 'set -e && npm test'])
  ("never certifies compound success OR failure: %s", (command) => {
    expect(commandMatchesCheck(command, 'npm test')).toBe(false);
    expect(certainCheckCommand(command)).toBe(false);
    for (const hook of ['PostToolUse', 'PostToolUseFailure']) {
      const event = { state: hook === 'PostToolUse' ? 'working' as const : 'error' as const, hook, tool: 'Bash', command };
      expect(evidenceChecks(event, [{ id: 'test', name: 'Test', command: 'npm test' }])).toEqual(['test']);
      expect(checkMark({ ...evidence, passed: certainCheckCommand(command) ? hook === 'PostToolUse' : undefined }, fingerprint)).toBe('unknown');
    }
  });
  it.each(['npm test', 'a && npm test', 'npm test && b', 'a && npm test && b', "npm test -- '|| ; | & ( ) $(x) `x`'"])
  ('certifies only the command or an AND-only sequence: %s', (command) => {
    expect(commandMatchesCheck(command, 'npm test')).toBe(true);
    expect(certainCheckCommand(command)).toBe(true);
    for (const passed of [true, false]) expect(checkMark({ ...evidence, passed }, fingerprint)).toBe(passed ? 'passed' : 'failed');
  });
  it.each(['echo "npm test || true"', "echo '(npm test)'", "echo '$(npm test)'", "echo '`npm test`'"])
  ('does not count commands inside quotes: %s', (command) => {
    expect(evidenceChecks({ state: 'working', hook: 'PostToolUse', tool: 'Bash', command }, [{ id: 'test', name: 'Test', command: 'npm test' }])).toBeUndefined();
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
