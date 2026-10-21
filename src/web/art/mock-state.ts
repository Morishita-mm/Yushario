import type { AgentEvent } from "../../core/events";
import type { QuestDetail } from "../../core/quests";
import type { PartyMember } from "../../core/party";
import type { TownRecord, TownSettings } from "../../core/town-ledger";
import type { Session } from "../terminal";
import { mockChecks, mockFingerprint } from "./mock-checks";

export const demo = {
  events: [] as { event: AgentEvent; at: number }[],
  sessions: [] as Session[],
  towns: ["village", "port", "snow", "desert", "volcano"].map((theme, i) => ({
    key: `/demo/town-${i}`, path: `/demo/town-${i}`, name: ["クエストの町", "海辺の町", "雪の町", "砂漠の町", "火山の町"][i],
    theme, pinned: false, firstSeenAt: Date.now(), lastActiveAt: Date.now(),
  })) as TownRecord[],
  names: {} as Record<string, string>,
  quests: [] as QuestDetail[],
  members: [] as PartyMember[],
  settings: { archiveAfterDays: 30, sound: "off", language: "auto", saveConversation: false } as TownSettings,
};
let next = 0;
export const heroId = (session: string) => `hero-${session}`;
export function event(session: string, fields: Partial<AgentEvent>, at = Date.now()): void {
  const info = demo.sessions.find((item) => item.id === session);
  if (!info) return;
  demo.events.push({ at, event: { state: "idle", agent: heroId(session), terminal: session,
    name: demo.names[heroId(session)] ?? session, project: info.project, source: info.preset, branch: info.branch, ...fields } });
}
export function addHero(name?: string, project = demo.towns[0].key!, preset = "claude"): Session {
  const id = `demo-${++next}`;
  const session: Session = { id, project, cwd: project, preset, branch: "quest/demo", createdAt: Date.now(), weapon: "steel", accessory: "high" };
  demo.sessions.push(session);
  if (preset !== "shell") { demo.names[heroId(id)] = name || `デモ勇者${next}`; event(id, { hook: "SessionStart" }); }
  return session;
}
export function addQuest(town = demo.towns[0].key!, title = "町の バグを なおす", purpose = "エラー文を わかりやすくする"): QuestDetail {
  const quest: QuestDetail = { id: `demo-quest-${crypto.randomUUID()}`, town, title, purpose, state: "open", createdAt: Date.now(), updatedAt: Date.now(), events: [], checks: [], fingerprint: mockFingerprint };
  demo.quests.push(quest); return quest;
}
export function assign(quest: QuestDetail, session: string): void {
  const info = demo.sessions.find((item) => item.id === session);
  if (!info) throw new Error("デモの勇者が見つかりません");
  quest.session = quest.writerSession = session; quest.hero = heroId(session);
  quest.worktreePath = info.cwd; quest.worktreeBranch = info.branch;
  demo.members = demo.members.filter((member) => member.session !== session && !(member.quest === quest.id && member.writer));
  demo.members.push({ quest: quest.id, session, hero: heroId(session), role: "implement", note: "", writer: true, joinedAt: Date.now() });
  quest.events.push({ id: ++next, quest: quest.id, kind: "assigned", at: Date.now(), title: "担当を 決めた", session, hero: heroId(session) });
}
export function reply(session: string, text: string): void {
  if (!demo.sessions.some((item) => item.id === session && item.preset !== "shell")) throw new Error("会話できるデモの勇者を選んでください");
  event(session, { hook: "UserPromptSubmit", state: "thinking", text });
  // A labelled fixture, never an AI answer or a claim that commands ran.
  const answer = "【デモの返答】依頼を受け取りました。この体験版ではCLI・コマンド・ファイル変更は実行しません。報告と鑑定の画面を試せます。";
  event(session, { hook: "Stop", state: "success", text: answer });
  const quest = demo.quests.find((item) => item.session === session || demo.members.some((member) => member.quest === item.id && member.session === session));
  if (quest) {
    quest.state = "review"; quest.updatedAt = Date.now();
    quest.events.push({ id: ++next, quest: quest.id, kind: "report", title: "デモの報告", at: quest.updatedAt, session, hero: heroId(session), text: answer });
  }
}
export function questPacket() {
  return { type: "quests", quests: demo.quests, reports: [],
    bindings: demo.members.map(({ quest, session, hero }) => ({ quest, session, hero })),
    members: demo.members.map(({ quest, session, role, writer }) => ({ quest, session, role, writer })) };
}
export function party(quest: string) {
  return demo.members.filter((member) => member.quest === quest).map((member) => ({ ...member,
    name: demo.names[heroId(member.session)], active: !demo.sessions.find((s) => s.id === member.session)?.exited,
    canTalk: demo.sessions.find((s) => s.id === member.session)?.preset !== "shell", sessionInfo: demo.sessions.find((s) => s.id === member.session) }));
}
const activities = [
  ["アレン", "idle", "SessionStart", undefined, undefined],
  ["ミラ", "working", "PreToolUse", "Edit", "settings.ts"],
  ["ルカ", "working", "PreToolUse", "Bash", "npm test"],
  ["ノア", "working", "PreToolUse", "Bash", "npm run build"],
  ["リナ", "working", "PreCompact", undefined, undefined],
  ["フィン", "idle", "SessionStart", undefined, undefined],
  ["ソラ", "working", "PreToolUse", "Read", "README.md"],
  ["アイリ", "working", "PreToolUse", "Grep", "TODO"],
  ["トマ", "working", "PreToolUse", "mcp__demo__inspect", undefined],
] as const;
for (const [name, state, hook, tool, target] of activities) {
  const session = addHero(name);
  const at = Date.now() - (name === "フィン" ? 16 * 60_000 : 2000);
  demo.events[demo.events.length - 1].at = at - 1000;
  event(session.id, { state, hook, tool, target }, at);
}
for (let i = 1; i < 5; i++) addHero(["エマ", "カイ", "セラ", "レオ"][i - 1], demo.towns[i].key!);
reply(demo.sessions[0].id, "町の案内を おねがいします。");
const quest = addQuest(); assign(quest, demo.sessions[0].id); quest.state = "review"; quest.checks = mockChecks(quest.id);
quest.events.push({ id: ++next, quest: quest.id, kind: "report", at: Date.now(), title: "デモの報告", session: quest.session, hero: quest.hero,
  text: "【デモ】エラー文を修正した想定の報告です。コードと検証の結果は架空のサンプルです。" });
