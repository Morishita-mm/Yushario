import { describe, expect, it } from "vitest";
import type { AgentEvent } from "./events";
import { jobName, narrate } from "./story";

const e = (change: Partial<AgentEvent>): AgentEvent => ({ state: "working", name: "Hero 1", ...change });
describe("English narration", () => {
  it.each([
    [e({ hook: "SessionStart" }), "Hero 1 arrived in town!"],
    [e({ hook: "SessionEnd" }), "Hero 1 set off on a journey."],
    [e({ hook: "Interrupt" }), "Hero 1 fled the battle!"],
    [e({ hook: "UserPromptSubmit" }), "Hero 1 took on a new quest!"],
    [e({ hook: "Notification", state: "waiting_input" }), "Hero 1 is calling you!"],
    [e({ hook: "Notification", state: "idle" }), "Hero 1 awaits the next quest."],
    [e({ hook: "PermissionRequest", tool: "Bash" }), "Hero 1 asks permission for Bash!"],
    [e({ hook: "PreCompact" }), "Hero 1 is praying at the church."],
    [e({ hook: "PostCompact" }), "Hero 1 rested!"],
    [e({ hook: "PostCompact", detail: "Compaction failed" }), "Hero 1 couldn't rest. Back to town."],
    [e({ hook: "PostCompact", detail: "Compaction cancelled" }), "Hero 1 couldn't rest. Back to town."],
    [e({ hook: "Stop" }), "Hero 1 takes a break in town."],
    [e({ hook: "StopFailure" }), "Hero 1 ran out of strength…"],
    [e({ hook: "TaskCreated", task: { id: "1", subject: "Write tests", status: "pending" } }), 'Quest accepted: "Write tests"!'],
    [e({ hook: "TaskCompleted", task: { id: "1", status: "completed" } }), "Quest complete!"],
    [e({ hook: "PreToolUse", tool: "Edit", target: "room.ts" }), 'Hero 1 attacks "room.ts"!'],
    [e({ hook: "PreToolUse", tool: "Bash", target: "npm test" }), 'Hero 1 challenges the Golem! "npm test"'],
    [e({ hook: "PreToolUse", tool: "Bash", target: "pwd" }), 'Hero 1 casts a spell! "pwd"'],
    [e({ hook: "PreToolUse", tool: "Read" }), "Hero 1 reads a spellbook in the library."],
    [e({ hook: "PreToolUse", tool: "Grep" }), "Hero 1 searches the archives…"],
    [e({ hook: "PreToolUse", tool: "WebFetch" }), "Hero 1 surveys the horizon from the tower."],
    [e({ hook: "PreToolUse", tool: "Bash", target: "git status" }), 'Hero 1 records the journey. "git status"'],
    [e({ hook: "PreToolUse", tool: "Agent" }), "Hero 1 gathers the party!"],
    [e({ hook: "PreToolUse", tool: "AskUserQuestion" }), "Hero 1 has a question for you."],
    [e({ hook: "PreToolUse", tool: "Custom" }), "Hero 1 uses a tool. (Custom)"],
    [e({ hook: "PostToolUse", tool: "Edit", target: "room.ts", ts: 0 }), '3 damage to "room.ts"!'],
    [e({ hook: "PostToolUse", tool: "Bash", target: "npm test" }), "Trial complete! Golem defeated!"],
    [e({ hook: "PostToolUse", tool: "Bash", target: "pwd" }), "The spell struck true!"],
    [e({ hook: "PostToolUse", tool: "Agent" }), "The party defeated the Dragon!"],
    [e({ hook: "PostToolUseFailure", tool: "Bash", state: "error" }), "Hero 1 took damage! (Bash failed)"],
    [e({ hook: "PostToolUseFailure", state: "idle" }), "Hero 1's action was interrupted."],
    [e({ hook: "SubagentStart", subagent: { id: "h", type: "Explore" } }), "Thief (Explore) joined the party!"],
    [e({ hook: "SubagentStop", subagent: { id: "h", type: "Plan" } }), "Priest left Hero 1's party."],
    [e({ state: "error", subagent: { id: "h", type: "general-purpose" } }), "Warrior took damage!"],
  ])("tells %j as %s", (event, text) => expect(narrate(event as AgentEvent, undefined, "en")).toBe(text));

  it("keeps names and user data intact, and only announces actual MP recovery", () => {
    expect(narrate(e({ hook: "SessionStart", name: "アルス" }), undefined, "en")).toBe("アルス arrived in town!");
    expect(narrate({ state: "idle", hook: "SessionStart" }, undefined, "en")).toBe("Hero arrived in town!");
    expect(narrate(e({ hook: "PostCompact", context: 0.3 }), 0.8, "en")).toBe("Hero 1 rested! MP restored!");
    expect(narrate(e({ hook: "PostCompact", context: 0.8 }), 0.3, "en")).toBe("Hero 1 rested!");
    expect(narrate(e({ hook: "Notification" }), undefined, "en")).toBeUndefined();
    expect(jobName("mage", "en")).toBe("Mage");
    expect(jobName("hero", "ja")).toBe("ゆうしゃ");
  });
});
