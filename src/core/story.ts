import { toolActivity, type Activity } from "./activity";
import type { AgentEvent } from "./events";
import { MOOD_RULES, type RoomAgent } from "./room";

// The RPG telling of agent work (docs/OBSERVATION.md): agents are heroes, work is battle,
// subagents join the party, rest happens at the inn.
export type Job = "hero" | "warrior" | "mage" | "thief" | "priest";
export type MonsterKind = "slime" | "ghost" | "golem" | "dragon";

export const JOB_NAMES: Record<Job, string> = {
  hero: "ゆうしゃ", warrior: "せんし", mage: "まほうつかい", thief: "とうぞく", priest: "そうりょ",
};

// Battles: what each kind of work is fought as.
const BATTLES: Partial<Record<Activity, MonsterKind>> = {
  edit: "slime", run: "ghost", test: "golem", delegate: "dragon",
};

export function battleMonster(activity: Activity): MonsterKind | undefined {
  return BATTLES[activity];
}

export function jobOf(subagentType: string | undefined): Job {
  switch (subagentType) {
    case "Explore": return "thief";
    case "Plan": return "priest";
    case "general-purpose": return "warrior";
    default: return "mage";
  }
}

export interface Stats { level: number; hp: number; mp: number }

// hp and mp are 0–1. HP falls with recent failures, MP is the context left.
export function stats(agent: RoomAgent, now: number): Stats {
  const recentFailures = agent.failures
    .filter((at) => at <= now && now - at < MOOD_RULES.struggleWindowMs).length;
  return {
    level: 1 + Math.floor((agent.wins + agent.quests * 5) / 10),
    hp: Math.max(0.1, 1 - recentFailures / 5),
    mp: 1 - (agent.context ?? 0),
  };
}

// A stable, varied damage number for a hit (no randomness, so replays agree).
export function damage(event: AgentEvent): number {
  return 3 + Math.abs(Math.round(event.ts ?? 0)) % 37;
}

function quoted(text: string | undefined, fallback: string): string {
  return text ? `「${text}」` : fallback;
}

// One line of narration for an event, in the style of an old console RPG. Undefined = say nothing.
export function narrate(event: AgentEvent): string | undefined {
  const name = event.name ?? "ゆうしゃ";
  const target = event.target;
  if (event.subagent) {
    const job = JOB_NAMES[jobOf(event.subagent.type)];
    if (event.hook === "SubagentStart") return `${job}（${event.subagent.type ?? "なかま"}）が なかまに くわわった！`;
    if (event.hook === "SubagentStop") return `${job}は ${name}の パーティーを はなれた。`;
    if (event.state === "error") return `${job}は ダメージを うけた！`;
    return undefined;
  }
  switch (event.hook) {
    case "SessionStart": return `${name}が 町に やってきた！`;
    case "SessionEnd": return `${name}は 旅立っていった。`;
    case "Interrupt": return `${name}は たたかいから にげだした！`;
    case "UserPromptSubmit": return `${name}は あたらしい いらいを うけた！`;
    case "Notification": return `${name}は あなたを よんでいる！`;
    case "PermissionRequest": return `${name}は ${event.tool ?? "じゅもん"}の きょかを もとめている！`;
    case "PreCompact": return `${name}は 教会で いのりを ささげた…`;
    case "PostCompact": return `${name}の MPが かいふくした！`;
    case "Stop": return `${name}は 宿屋で ひとやすみ することにした。`;
    case "StopFailure": return `${name}は ちからつきた…`;
    case "TaskCreated": return `クエスト${quoted(event.task?.subject, "")}を うけた！`;
    case "TaskCompleted": return `クエスト${quoted(event.task?.subject, "")}を たっせいした！`;
    case "PreToolUse": return event.tool ? begin(name, toolActivity(event.tool, target), target, event.tool) : undefined;
    case "PostToolUse":
      if (event.state === "error") return `${name}は ダメージを うけた！（${event.tool ?? "こうどう"}が しっぱい）`;
      return event.tool ? finish(event, toolActivity(event.tool, target)) : undefined;
    case "PostToolUseFailure":
      if (event.state === "idle") return `${name}の こうどうは さえぎられた。`;
      return `${name}は ダメージを うけた！（${event.tool ?? "こうどう"}が しっぱい）`;
    default: return undefined;
  }
}

function begin(name: string, activity: Activity, target: string | undefined, tool: string): string | undefined {
  switch (activity) {
    case "edit": return `${name}の こうげき！ ${quoted(target, "まもの")}に きりかかった！`;
    case "test": return `${name}は しれんの ゴーレムに いどんだ！ ${quoted(target, "")}`;
    case "run": return `${name}は じゅもんを となえた！ ${quoted(target, "")}`;
    case "read": return `${name}は 図書館で ${quoted(target, "まどうしょ")}を ひもといた。`;
    case "search": return `${name}は 書庫を さがしまわっている…`;
    case "web": return `${name}は 物見の塔から ${target ?? "とおく"}を みわたした。`;
    case "git": return `${name}は 冒険の書に きろくした。${quoted(target, "")}`;
    case "delegate": return `${name}は なかまを よびあつめた！`;
    case "ask": return `${name}は あなたに たずねている。`;
    case "tool": return `${name}は どうぐを つかった。（${tool}）`;
    default: return undefined; // plan is told through quests
  }
}

function finish(event: AgentEvent, activity: Activity): string | undefined {
  switch (activity) {
    case "edit": return `${quoted(event.target, "まもの")}に ${damage(event)}の ダメージ！`;
    case "test": return "しれんを のりこえた！ ゴーレムを たおした！";
    case "run": return "じゅもんは みごとに きまった！";
    case "delegate": return "なかまの ちからで ドラゴンを たおした！";
    default: return undefined;
  }
}
