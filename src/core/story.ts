import { toolActivity, type Activity } from "./activity";
import type { AgentEvent } from "./events";
import { MOOD_RULES, type RoomAgent } from "./room";
import type { Language } from "./town-ledger";

// Agents are heroes, work is battle; compacting is prayer, dozing belongs in the inn.
export type Job = "hero" | "warrior" | "mage" | "thief" | "priest";
export type MonsterKind = "slime" | "ghost" | "golem" | "dragon";
export function jobName(job: Job, language: Language = "ja"): string {
  return language === "ja" ? { hero: "ゆうしゃ", warrior: "せんし", mage: "まほうつかい", thief: "とうぞく", priest: "そうりょ" }[job]
    : { hero: "Hero", warrior: "Warrior", mage: "Mage", thief: "Thief", priest: "Priest" }[job];
}
export const JOB_NAMES: Record<Job, string> = {
  hero: jobName("hero"), warrior: jobName("warrior"), mage: jobName("mage"), thief: jobName("thief"), priest: jobName("priest"),
};
const BATTLES: Partial<Record<Activity, MonsterKind>> = { edit: "slime", run: "ghost", test: "golem", delegate: "dragon" };
export function battleMonster(activity: Activity): MonsterKind | undefined { return BATTLES[activity]; }
export function jobOf(subagentType: string | undefined): Job {
  switch (subagentType) {
    case "Explore": return "thief";
    case "Plan": return "priest";
    case "general-purpose": return "warrior";
    default: return "mage";
  }
}
export interface Stats { level: number; hp: number; mp: number }
export function stats(agent: RoomAgent, now: number): Stats {
  const recentFailures = agent.failures.filter((at) => at <= now && now - at < MOOD_RULES.struggleWindowMs).length;
  return { level: 1 + Math.floor((agent.wins + agent.quests * 5) / 10), hp: Math.max(0.1, 1 - recentFailures / 5), mp: 1 - (agent.context ?? 0) };
}
export function damage(event: AgentEvent): number { return 3 + Math.abs(Math.round(event.ts ?? 0)) % 37; }
function quoted(text: string | undefined, fallback: string, language: Language): string {
  return text ? language === "ja" ? `「${text}」` : `"${text}"` : fallback;
}
// Pure: language, event and previous context are all inputs. Undefined means silence.
export function narrate(event: AgentEvent, previousContext?: number, language: Language = "ja"): string | undefined {
  const tr = (ja: string, en: string) => language === "ja" ? ja : en;
  const name = event.name ?? tr("ゆうしゃ", "Hero");
  const target = event.target;
  if (event.subagent) {
    const job = jobName(jobOf(event.subagent.type), language);
    if (event.hook === "SubagentStart") return tr(`${job}（${event.subagent.type ?? "なかま"}）が なかまに くわわった！`, `${job} (${event.subagent.type ?? "Ally"}) joined the party!`);
    if (event.hook === "SubagentStop") return tr(`${job}は ${name}の パーティーを はなれた。`, `${job} left ${name}'s party.`);
    if (event.state === "error") return tr(`${job}は ダメージを うけた！`, `${job} took damage!`);
    return undefined;
  }
  switch (event.hook) {
    case "SessionStart": return tr(`${name}が 町に やってきた！`, `${name} arrived in town!`);
    case "SessionEnd": return tr(`${name}は 旅立っていった。`, `${name} set off on a journey.`);
    case "Interrupt": return tr(`${name}は たたかいから にげだした！`, `${name} fled the battle!`);
    case "UserPromptSubmit": return tr(`${name}は あたらしい いらいを うけた！`, `${name} took on a new quest!`);
    case "Notification": return event.state === "waiting_input" ? tr(`${name}は あなたを よんでいる！`, `${name} is calling you!`)
      : event.state === "idle" ? tr(`${name}は つぎの いらいを まっている。`, `${name} awaits the next quest.`) : undefined;
    case "PermissionRequest": return tr(`${name}は ${event.tool ?? "じゅもん"}の きょかを もとめている！`, `${name} asks permission for ${event.tool ?? "a spell"}!`);
    case "PreCompact": return tr(`${name}は きょうかいで いのりを ささげている`, `${name} is praying at the church.`);
    case "PostCompact": {
      if (event.detail === "Compaction failed" || event.detail === "Compaction cancelled") {
        return tr(`${name}は 会話を せいりできなかった。町で ひとやすみ。`, `${name} couldn't rest. Back to town.`);
      }
      const recovered = previousContext !== undefined && event.context !== undefined
        && Math.round((1 - event.context) * 100) > Math.round((1 - previousContext) * 100);
      return tr(`${name}は 会話を まとめた！${recovered ? " MPが かいふくした！" : ""}`, `${name} rested!${recovered ? " MP restored!" : ""}`);
    }
    case "Stop": return tr(`${name}は 町で ひとやすみ することにした。`, `${name} takes a break in town.`);
    case "StopFailure": return tr(`${name}は ちからつきた…`, `${name} ran out of strength…`);
    case "TaskCreated": return tr(`クエスト${quoted(event.task?.subject, "", "ja")}を うけた！`, `Quest accepted${event.task?.subject ? `: ${quoted(event.task.subject, "", "en")}` : ""}!`);
    case "TaskCompleted": return tr(`クエスト${quoted(event.task?.subject, "", "ja")}を たっせいした！`, `Quest complete${event.task?.subject ? `: ${quoted(event.task.subject, "", "en")}` : ""}!`);
    case "PreToolUse": return event.tool ? begin(name, toolActivity(event.tool, target), target, event.tool, language) : undefined;
    case "PostToolUse":
      if (event.state === "error") return tr(`${name}は ダメージを うけた！（${event.tool ?? "こうどう"}が しっぱい）`, `${name} took damage! (${event.tool ?? "Action"} failed)`);
      return event.tool ? finish(event, toolActivity(event.tool, target), language) : undefined;
    case "PostToolUseFailure":
      if (event.state === "idle") return tr(`${name}の こうどうは さえぎられた。`, `${name}'s action was interrupted.`);
      return tr(`${name}は ダメージを うけた！（${event.tool ?? "こうどう"}が しっぱい）`, `${name} took damage! (${event.tool ?? "Action"} failed)`);
    default: return undefined;
  }
}
function begin(name: string, activity: Activity, target: string | undefined, tool: string, language: Language): string | undefined {
  const tr = (ja: string, en: string) => language === "ja" ? ja : en;
  switch (activity) {
    case "edit": return tr(`${name}の こうげき！ ${quoted(target, "まもの", "ja")}に きりかかった！`, `${name} attacks ${quoted(target, "the monster", "en")}!`);
    case "test": return tr(`${name}は しれんの ゴーレムに いどんだ！ ${quoted(target, "", "ja")}`, `${name} challenges the Golem! ${quoted(target, "", "en")}`);
    case "run": return tr(`${name}は じゅもんを となえた！ ${quoted(target, "", "ja")}`, `${name} casts a spell! ${quoted(target, "", "en")}`);
    case "read": return tr(`${name}は 図書館で ${quoted(target, "まどうしょ", "ja")}を ひもといた。`, `${name} reads ${quoted(target, "a spellbook", "en")} in the library.`);
    case "search": return tr(`${name}は 書庫を さがしまわっている…`, `${name} searches the archives…`);
    case "web": return tr(`${name}は 物見の塔から ${target ?? "とおく"}を みわたした。`, `${name} surveys ${target ?? "the horizon"} from the tower.`);
    case "git": return tr(`${name}は 冒険の書に きろくした。${quoted(target, "", "ja")}`, `${name} records the journey. ${quoted(target, "", "en")}`);
    case "delegate": return tr(`${name}は なかまを よびあつめた！`, `${name} gathers the party!`);
    case "ask": return tr(`${name}は あなたに たずねている。`, `${name} has a question for you.`);
    case "tool": return tr(`${name}は どうぐを つかった。（${tool}）`, `${name} uses a tool. (${tool})`);
    default: return undefined;
  }
}
function finish(event: AgentEvent, activity: Activity, language: Language): string | undefined {
  const tr = (ja: string, en: string) => language === "ja" ? ja : en;
  switch (activity) {
    case "edit": return tr(`${quoted(event.target, "まもの", "ja")}に ${damage(event)}の ダメージ！`, `${damage(event)} damage to ${quoted(event.target, "the monster", "en")}!`);
    case "test": return tr("しれんを のりこえた！ ゴーレムを たおした！", "Trial complete! Golem defeated!");
    case "run": return tr("じゅもんは みごとに きまった！", "The spell struck true!");
    case "delegate": return tr("なかまの ちからで ドラゴンを たおした！", "The party defeated the Dragon!");
    default: return undefined;
  }
}
