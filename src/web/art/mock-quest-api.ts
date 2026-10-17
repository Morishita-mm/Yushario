import { addQuest, assign, demo, heroId, party, reply } from "./mock-state";
import { mockFingerprint } from "./mock-checks";
import { TACTICS } from "../../core/tactics";
import type { PartyRole } from "../../core/party";

// Only the existing quest HTTP contract. Unsupported operations return an error, never a fake success.
export function questApi(url: URL, method: string, body: Record<string, any>): unknown {
  const parts = url.pathname.split("/").filter(Boolean), id = parts[2], action = parts[3];
  if (!id) {
    if (method === "POST") return addQuest(body.town, body.title, body.purpose);
    if (method === "DELETE") { demo.quests = []; demo.members = []; }
    return demo.quests;
  }
  if (id === "report-link") return null;
  if (id === "checks-report") return { checks: [], fingerprint: mockFingerprint };
  const quest = demo.quests.find((item) => item.id === id);
  if (!quest) throw new Error("クエストが見つかりません");
  if (!action) {
    if (method === "DELETE") { demo.quests = demo.quests.filter((item) => item !== quest); demo.members = demo.members.filter((member) => member.quest !== id); }
    if (method === "PATCH") for (const key of ["title", "purpose", "state"] as const) if (body[key] !== undefined) quest[key] = body[key];
    return quest;
  }
  if (action === "assign") { assign(quest, body.session); return quest; }
  if (action === "send" || action === "research") { reply(body.session ?? quest.session, body.text); return { delivered: true }; }
  if (action === "party") {
    if (method === "DELETE") demo.members = demo.members.filter((member) => member.quest !== id || member.session !== url.searchParams.get("session"));
    if (method === "POST") {
      const session = demo.sessions.find((item) => item.id === body.session);
      if (!session || session.project !== quest.town) throw new Error("同じ町の勇者を選んでください");
      if (body.writer) assign(quest, session.id);
      else {
        demo.members = demo.members.filter((member) => member.session !== session.id);
        demo.members.push({ quest: id, session: session.id, hero: heroId(session.id), role: body.role as PartyRole, writer: false, note: body.note ?? "", joinedAt: Date.now() });
      }
    }
    return party(id);
  }
  if (action === "tactic") {
    if (method === "POST" && body.tactic !== "obey") throw new Error("デモでは「命令に従え」のみです。自動作戦・CLIは実行しません。");
    const fit = { ok: true, gaps: [], inside: [], outside: [] };
    return { tactic: "obey", fit, fits: Object.fromEntries(TACTICS.map((key) => [key, key === "obey" ? fit : { ...fit, ok: false, gaps: ["owner"] }])), running: false, round: 0, waiting: 0, total: 0 };
  }
  if (action === "checks") {
    if (method === "POST") (quest.checks ??= []).push({ id: crypto.randomUUID(), name: body.name, command: body.command });
    if (method === "DELETE") quest.checks = quest.checks?.filter((check) => check.id !== parts[4]);
    return { checks: quest.checks ?? [], fingerprint: mockFingerprint, candidates: [{ name: "型チェック", command: "npm run typecheck" }, { name: "テスト", command: "npm test" }] };
  }
  if (action === "adopt") {
    quest.state = "done";
    quest.events.push({ id: Date.now(), quest: id, kind: "adopted", title: "デモの版を 採用した", at: Date.now(), session: quest.session, hero: quest.hero });
    return quest;
  }
  if (action === "scroll") return { text: `【デモ】${quest.title}\n${quest.purpose}` };
  if (action === "base" && method === "POST") { assign(quest, body.session); return quest; }
  throw new Error("この操作はデモ対象外です。実データにはアクセスしません。");
}
