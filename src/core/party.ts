import { toolActivity } from "./activity";
import type { AgentEvent } from "./events";
import type { Language } from "./town-ledger";

export const PARTY_ROLES = ["implement", "review", "research", "test", "command"] as const;
export type PartyRole = typeof PARTY_ROLES[number];
export type PartyMember = { quest: string; session: string; hero?: string; role: PartyRole; note: string; writer: boolean; joinedAt: number };
export function partyRole(value: unknown): value is PartyRole { return PARTY_ROLES.includes(value as PartyRole); }
// Exactly 32 random bytes encoded as hex. Never accept a prefix, coercion, or an empty secret.
export function agentTokenBytes(value: unknown): number[] | undefined {
  if (typeof value !== "string" || value.length !== 64 || !/^[a-f0-9]{64}$/.test(value)) return;
  return Array.from({ length: 32 }, (_, i) => parseInt(value.slice(i * 2, i * 2 + 2), 16));
}
// The server supplies the result of crypto.timingSafeEqual on the fixed-size bytes.
export function agentAuthorized(tokenMatches: boolean, active: boolean, member: PartyMember | undefined,
  quest: string, action: string): boolean {
  return tokenMatches && active && member?.quest === quest
    && (action === "read" || action === "note" || member.role === "command" && ["send", "invite", "review"].includes(action));
}
export function roleLabel(role: PartyRole, language: Language): string {
  const labels = { implement: ["担当", "Owner"], review: ["レビュー", "Review"], research: ["調べる", "Research"], test: ["テスト", "Test"], command: ["しき", "Command"] };
  return labels[role][language === "ja" ? 0 : 1];
}
export function roleIntroduction(member: Pick<PartyMember, "role" | "note" | "writer">, language: Language): string {
  const ja = language === "ja", role = roleLabel(member.role, language);
  const text = ja ? `あなたは このクエストの ${role}役です。${member.writer ? "ファイルを かきかえる役です。" : "ファイルは かきかえず、気づいたことを ほうこくしてください。"}`
    : `You are this quest's ${role.toLowerCase()} hero. ${member.writer ? "You hold the writing role." : "Do not change files; report your findings."}`;
  // Helpers cannot message other heroes: say where the report goes so they do not look for a way to pass it on.
  const route = member.writer || member.role === "command" ? "" : ja
    ? "\n報告は Yushario が依頼者へ届けます（作戦によっては担当にも届けます）。ほかの勇者へ自分で送る必要はありません。"
    : "\nYushario delivers your report to the requester (and the owner, depending on the tactic). You do not need to send it to other heroes.";
  // The tools are explained once, in the skill shipped with the app (skills/yushario-party/SKILL.md).
  const tool = member.role !== "command" ? "" : ja
    ? "\n管理ツール: yushario quest read --json / send --session <id> --text '…' / invite / review。使い方は $AGENT_CHARACTER_QUEST_SKILL を参照してください。仲間の招待と役割の変更には人の承認が必要です。採用はできません。"
    : "\nTools: yushario quest read --json / send --session <id> --text '…' / invite / review. See $AGENT_CHARACTER_QUEST_SKILL for usage. Invitations and role changes need human approval. You cannot adopt."
  return text + route + (member.note ? `\n${member.note}` : "") + tool;
}
export function partyEditFiles(event: AgentEvent): string[] {
  return event.hook === "PostToolUse" && event.state !== "error" && event.tool && event.target && toolActivity(event.tool, event.target) === "edit" ? [event.target] : [];
}
export function outsideRole(member: PartyMember | undefined, files: string[]): boolean { return Boolean(member && !member.writer && files.length); }
export function partyEventTitle(kind: string, title: string, language: Language): string {
  const ja = language === "ja";
  if (kind === "handoff") return ja ? "引き継ぎのメモ（巻物）" : "Handoff note (scroll)";
  if (kind === "command") {
    const name = /^しき (.*)から$/.exec(title)?.[1] ?? /^From commander (.*)$/.exec(title)?.[1];
    if (name) return ja ? `しき ${name}から` : `From commander ${name}`;
  }
  if (kind === "outside-role") {
    const name = /^(.*)が やくわりの そとで ファイルを かえた$/.exec(title)?.[1] ?? /^(.*) changed files outside their role$/.exec(title)?.[1];
    if (name) return ja ? `${name}が やくわりの そとで ファイルを かえた` : `${name} changed files outside their role`;
  }
  if (kind === "party") return ["仲間の よびかけを ことわった", "Invitation declined"].includes(title)
    ? ja ? "仲間の よびかけを ことわった" : "Invitation declined" : ja ? "パーティーを かえた" : "Party updated";
  if (kind === "request" && ["あなたから", "From you"].includes(title)) return ja ? "あなたから" : "From you";
  return title;
}
