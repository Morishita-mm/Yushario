import { describe, expect, it } from "vitest";
import type { AgentEvent } from "./events";
import { Room } from "./room";
import { battleMonster, damage, jobOf, narrate, stats } from "./story";

const e = (event: Partial<AgentEvent>): AgentEvent => ({ state: "working", name: "t12-vitals", agent: "s1", ...event });

describe("story", () => {
  it("fights work as monsters and leaves other activities peaceful", () => {
    expect(battleMonster("edit")).toBe("slime");
    expect(battleMonster("run")).toBe("ghost");
    expect(battleMonster("test")).toBe("golem");
    expect(battleMonster("delegate")).toBe("dragon");
    expect(battleMonster("read")).toBeUndefined();
    expect(battleMonster("idle")).toBeUndefined();
  });

  it("gives subagents a party job", () => {
    expect(jobOf("Explore")).toBe("thief");
    expect(jobOf("Plan")).toBe("priest");
    expect(jobOf("general-purpose")).toBe("warrior");
    expect(jobOf("code-reviewer")).toBe("mage");
    expect(jobOf(undefined)).toBe("mage");
  });

  it("levels up with wins and quests, loses HP to recent failures, and spends MP as context", () => {
    const room = new Room();
    let agent = room.apply(e({ hook: "SessionStart", state: "idle", context: 0.25 }), 0)!;
    expect(stats(agent, 0)).toEqual({ level: 1, hp: 1, mp: 0.75 });
    for (let i = 1; i <= 10; i++) agent = room.apply(e({ hook: "PostToolUse", tool: "Read" }), i)!;
    room.apply(e({ hook: "TaskCompleted", task: { id: "1", status: "completed" } }), 11);
    room.apply(e({ hook: "TaskCompleted", task: { id: "1", status: "completed" } }), 12);
    expect(agent.quests).toBe(1);
    expect(stats(agent, 12).level).toBe(2);
    room.apply(e({ hook: "PostToolUseFailure", tool: "Bash", state: "error" }), 13);
    room.apply(e({ hook: "PostToolUseFailure", tool: "Bash", state: "error" }), 14);
    expect(stats(agent, 15).hp).toBeCloseTo(0.6);
    expect(stats(agent, 14 + 5 * 60_000).hp).toBe(1);
  });

  it.each([
    [0.16, 0.16, false], [0.161, 0.159, false], [0.16, 0.10, true],
    [0.10, 0.16, false], [undefined, 0.10, false], [0.16, undefined, false],
  ])("only narrates MP recovery when the displayed number rises (%s → %s)", (before, context, recovered) => {
    const event = e({ hook: "PostCompact", state: "idle", ...(context === undefined ? {} : { context }) });
    expect(narrate(event, before)).toBe(`t12-vitalsは 会話を まとめた！${recovered ? " MPが かいふくした！" : ""}`);
    expect(narrate({ ...event, detail: "Compaction failed" }, before)).not.toContain("かいふく");
    expect(narrate({ ...event, detail: "Compaction cancelled" }, before)).not.toContain("かいふく");
  });

  it("keeps damage numbers stable for the same event", () => {
    const hit = e({ hook: "PostToolUse", tool: "Edit", ts: 1234 });
    expect(damage(hit)).toBe(damage({ ...hit }));
    expect(damage(hit)).toBeGreaterThanOrEqual(3);
  });

  it.each([
    [e({ hook: "SessionStart", state: "idle" }), "t12-vitalsが 町に やってきた！"],
    [e({ hook: "PreToolUse", tool: "Edit", target: "room.ts" }), "t12-vitalsの こうげき！ 「room.ts」に きりかかった！"],
    [e({ hook: "PreToolUse", tool: "Bash", target: "npm test" }), "t12-vitalsは しれんの ゴーレムに いどんだ！ 「npm test」"],
    [e({ hook: "PostToolUse", tool: "Bash", target: "npm test" }), "しれんを のりこえた！ ゴーレムを たおした！"],
    [e({ hook: "PostToolUseFailure", tool: "Bash", state: "error" }), "t12-vitalsは ダメージを うけた！（Bashが しっぱい）"],
    [e({ hook: "PostToolUseFailure", tool: "Bash", state: "idle" }), "t12-vitalsの こうどうは さえぎられた。"],
    [e({ hook: "TaskCompleted", task: { id: "1", subject: "テストを書く", status: "completed" } }), "クエスト「テストを書く」を たっせいした！"],
    [e({ hook: "SubagentStart", subagent: { id: "h1", type: "Explore" } }), "とうぞく（Explore）が なかまに くわわった！"],
    [e({ hook: "Stop", state: "success" }), "t12-vitalsは 町で ひとやすみ することにした。"],
    [e({ hook: "Notification", state: "idle" }), "t12-vitalsは つぎの いらいを まっている。"],
    [e({ hook: "Notification", state: "waiting_input" }), "t12-vitalsは あなたを よんでいる！"],
    [e({ hook: "Notification", state: "thinking" }), undefined],
    [e({ hook: "Notification", state: "success" }), undefined],
    [e({ hook: "PermissionRequest", state: "waiting_input", tool: "Bash" }), "t12-vitalsは Bashの きょかを もとめている！"],
    [e({ hook: "PreCompact" }), "t12-vitalsは きょうかいで いのりを ささげている"],
    [e({ hook: "PostCompact", state: "thinking" }), "t12-vitalsは 会話を まとめた！"],
    [e({ hook: "PostCompact", state: "idle", detail: "Compaction failed" }), "t12-vitalsは 会話を せいりできなかった。町で ひとやすみ。"],
    [e({ hook: "PostCompact", state: "idle", detail: "Compaction cancelled" }), "t12-vitalsは 会話を せいりできなかった。町で ひとやすみ。"],
    [e({ hook: "PreToolUse", tool: "Read", target: "a.ts", subagent: { id: "h1" } }), undefined],
    [e({ hook: "PostToolUse", tool: "Read" }), undefined],
    [e({ hook: "PreToolUse", tool: "TaskCreate" }), undefined],
  ])("narrates %j", (event, line) => {
    expect(narrate(event)).toBe(line);
  });
});
