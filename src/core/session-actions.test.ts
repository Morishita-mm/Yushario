import { describe, expect, it } from "vitest";
import { askingAfterEvent, earlyEquippedExit, hasTrustPrompt, replacedSession, waitingAfterEvent } from "./session-actions";

describe("early equipped exit", () => {
  const session = { createdAt: 1000, exited: { code: 1 }, weapon: "steel" };
  it("suggests removing either kind of equipment within five seconds, regardless of exit code", () => {
    expect(earlyEquippedExit(session, 1000)).toBe(true);
    expect(earlyEquippedExit(session, 6000)).toBe(true);
    expect(earlyEquippedExit({ ...session, exited: { code: 1, at: 2000 } }, 20000)).toBe(true);
    expect(earlyEquippedExit({ ...session, exited: { code: 1, at: 6001 } }, 20000)).toBe(false);
    expect(earlyEquippedExit({ ...session, weapon: undefined, accessory: "high", exited: { code: 0 } }, 2000)).toBe(true);
  });
  it("does not suggest removing equipment for a running, older, unequipped, or future session", () => {
    expect(earlyEquippedExit({ ...session, exited: undefined }, 2000)).toBe(false);
    expect(earlyEquippedExit(session, 6001)).toBe(false);
    expect(earlyEquippedExit({ ...session, weapon: undefined }, 2000)).toBe(false);
    expect(earlyEquippedExit(session, 999)).toBe(false);
  });
});

describe("folder trust prompts", () => {
  it.each(["Do you trust the files in this folder?", "Yes, I trust this folder",
    "Is this a project you created or one you trust?", "Trust project folder? /tmp/project",
    "Folder access\nTrust this folder? /tmp/project"])(
    "recognizes a Claude or pi prompt: %s", (output) => { expect(hasTrustPrompt(output)).toBe(true); },
  );
  it("ignores colours, OSC titles, and spaces drawn as cursor movements", () => {
    expect(hasTrustPrompt("\x1b]0;title\x07\x1b[32mYes,\x1b[1CI\x1b[1Ctrust\x1b[1Cthis\x1b[1Cfolder\x1b[0m")).toBe(true);
    expect(hasTrustPrompt("\x1b]0;title\x1b\\Trust\nproject\nfolder?")).toBe(true);
  });
  it("recognizes a prompt assembled across chunks", () => {
    const first = "\x1b[32mYes, I trust this fol";
    expect(hasTrustPrompt(first)).toBe(false);
    expect(hasTrustPrompt(first + "der\x1b[0m")).toBe(true);
  });
  it.each(["", "\x1b[0m", "Accessing workspace: /tmp/project", "Tool finished", "\x1b]0;Yes, I trust this folder\x07"])(
    "does not confuse unrelated output with a prompt: %s", (output) => { expect(hasTrustPrompt(output)).toBe(false); },
  );
});

describe("conversation replacement", () => {
  it("retires an old ID only on a main SessionStart in a continuing terminal", () => {
    const event = { state: "idle" as const, hook: "SessionStart", terminal: "pty1", agent: "new" };
    expect(replacedSession(event, "old")).toBe("old");
    expect(replacedSession(event, "new")).toBeUndefined(); // /reload
    expect(replacedSession(event, undefined)).toBeUndefined();
    expect(replacedSession({ ...event, subagent: { id: "helper" } }, "old")).toBeUndefined();
    expect(replacedSession({ ...event, terminal: undefined }, "old")).toBeUndefined();
    expect(replacedSession({ ...event, hook: "Stop" }, "old")).toBeUndefined();
  });
});

describe("session readiness", () => {

  it("recognizes waiting and busy boundaries including compact", () => {
    for (const hook of ["SessionStart", "Stop", "StopFailure", "PostCompact"]) {
      expect(waitingAfterEvent({ state: "idle", hook })).toBe(true);
    }
    for (const hook of ["UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure", "PreCompact"]) {
      expect(waitingAfterEvent({ state: "working", hook })).toBe(false);
    }
  });

  it("does not open delivery at Codex's first/resumed SessionStart before UserPromptSubmit", () => {
    for (const interrupted of [false, true]) {
      expect(waitingAfterEvent({ source: "codex", state: "idle", hook: "SessionStart" }, interrupted)).toBe(false);
      expect(waitingAfterEvent({ source: "codex", state: "thinking", hook: "UserPromptSubmit" }, interrupted)).toBe(false);
      for (const hook of ["Stop", "InterruptConfirmed", "PostCompact"]) {
        expect(waitingAfterEvent({ source: "codex", state: "idle", hook }, interrupted)).toBe(true);
      }
    }
  });

  it("keeps Claude/pi arrival ready and ignores helper Codex starts", () => {
    for (const source of ["claude-code", "pi"]) {
      expect(waitingAfterEvent({ source, state: "idle", hook: "SessionStart" })).toBe(true);
    }
    expect(waitingAfterEvent({ source: "codex", state: "idle", hook: "SessionStart", subagent: { id: "helper" } })).toBeUndefined();
  });

  it("ignores interrupted-turn tool hooks until the next prompt", () => {
    expect(waitingAfterEvent({ state: "idle", hook: "PostToolUseFailure" }, true)).toBeUndefined();
    expect(waitingAfterEvent({ state: "working", hook: "PostToolUse" }, true)).toBeUndefined();
    expect(waitingAfterEvent({ state: "thinking", hook: "UserPromptSubmit" }, true)).toBe(false);
    expect(waitingAfterEvent({ state: "success", hook: "Stop" }, true)).toBe(true);
    expect(waitingAfterEvent({ state: "idle", hook: "PostCompact", detail: "Compaction failed" })).toBe(true);
    expect(waitingAfterEvent({ state: "idle", hook: "PostCompact", detail: "Compaction cancelled" })).toBe(true);
  });

  it("ignores unrelated hooks and subagents, even those finishing after Stop", () => {
    for (const hook of [undefined, "Notification", "SubagentStop", "SessionEnd", "TaskCompleted"]) {
      expect(waitingAfterEvent({ state: "working", hook })).toBeUndefined();
    }
    expect(waitingAfterEvent({ state: "success", hook: "Stop", subagent: { id: "helper" } })).toBeUndefined();
  });
});

describe("asking after event", () => {
  it("treats permission requests, input notifications and questions as a prompt waiting for an answer", () => {
    expect(askingAfterEvent({ state: "waiting_input", hook: "PermissionRequest", tool: "Bash" })).toBe(true);
    expect(askingAfterEvent({ state: "waiting_input", hook: "Notification" })).toBe(true);
    expect(askingAfterEvent({ state: "working", hook: "PreToolUse", tool: "AskUserQuestion" })).toBe(true);
    expect(askingAfterEvent({ state: "waiting_input", hook: "PermissionRequest", subagent: { id: "helper" } })).toBe(true);
  });
  it("clears the prompt when the main conversation moves on", () => {
    expect(askingAfterEvent({ state: "working", hook: "PostToolUse", tool: "Bash" })).toBe(false);
    expect(askingAfterEvent({ state: "error", hook: "PostToolUseFailure", tool: "Bash" })).toBe(false);
    expect(askingAfterEvent({ state: "working", hook: "PreToolUse", tool: "Edit" })).toBe(false);
    expect(askingAfterEvent({ state: "thinking", hook: "Notification" })).toBe(false);
    expect(askingAfterEvent({ state: "success", hook: "Stop" })).toBe(false);
  });
  it("leaves the prompt as it is for helpers and events that do not show progress", () => {
    expect(askingAfterEvent({ state: "working", hook: "PostToolUse", tool: "Bash", subagent: { id: "helper" } })).toBeUndefined();
    expect(askingAfterEvent({ state: "working", hook: "TaskCreated" })).toBeUndefined();
  });
});
