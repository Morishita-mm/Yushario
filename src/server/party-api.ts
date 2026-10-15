import type { IncomingMessage, ServerResponse } from "node:http";
import { partyRole } from "../core/party";
import { handoffScroll } from "../core/party-scroll";
import { checkMark } from "../core/checks";
import { readJsonBody, ACTION_BODY_LIMIT } from "./http-body";
import { requirePartyConversation, TerminalOnlyError, type QuestParty } from "./party";
import { serverLanguage, tr } from "./language";
import { AGENTS } from "./agents";

export function partyJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(value));
}
export async function partyBody(request: IncomingMessage, response: ServerResponse): Promise<Record<string, unknown> | undefined> {
  const body = await readJsonBody(request, response, ACTION_BODY_LIMIT);
  if (!body.ok) return;
  if (!body.value || typeof body.value !== "object" || Array.isArray(body.value)) throw new Error("Invalid request");
  return body.value as Record<string, unknown>;
}
export function partyView(party: QuestParty, id: string) {
  return party.quests.party(id).map((member) => {
    const sessionInfo = party.pty.getSession(member.session);
    return { ...member, name: party.label(member.session), sessionInfo, canTalk: Boolean(sessionInfo && AGENTS[sessionInfo.preset].hero),
      waiting: party.pty.agentSession(member.session)?.waiting ?? false, active: party.pty.agentSession(member.session)?.active ?? false };
  });
}
export async function handlePartyRequest(request: IncomingMessage, response: ServerResponse, url: URL, party: QuestParty): Promise<void> {
  try {
    const parts = url.pathname.split("/"), id = decodeURIComponent(parts[3] ?? ""), action = parts[4];
    if (parts[2] === "party-notices") {
      if (request.method === "GET") { partyJson(response, 200, party.snapshot()); return; }
      const body = await partyBody(request, response); if (!body) return;
      if (request.method === "DELETE") { party.dismiss(id); partyJson(response, 200, { ok: true }); return; }
      if (request.method !== "POST" || typeof body.yes !== "boolean") throw new Error("Choose yes or no");
      partyJson(response, 200, await party.decide(id, body.yes)); return;
    }
    const quest = party.quests.get(id);
    if (!quest) { partyJson(response, 404, { error: tr("クエストが みつからない", "Quest not found") }); return; }
    if (action === "party" && request.method === "GET") { partyJson(response, 200, partyView(party, id)); return; }
    if (action === "scroll" && request.method === "GET") {
      const checks = quest.checks?.map((check) => ({ title: check.name, mark: checkMark(check.evidence, quest.fingerprint) })) ?? [];
      partyJson(response, 200, { text: handoffScroll(quest, checks, serverLanguage()), reply: party.latestReply(id) ?? quest.events.find((event) => event.kind === "report")?.text }); return;
    }
    if (request.method !== "POST") { response.writeHead(405).end(); return; }
    const body = await partyBody(request, response); if (!body) return;
    if (action === "party") {
      const session = typeof body.session === "string" ? party.pty.getSession(body.session) : undefined;
      if (!session || !party.pty.agentSession(session.id)?.active || !partyRole(body.role) || typeof body.note !== "string" || body.note.length > 200
        || body.writer !== undefined && typeof body.writer !== "boolean") throw new Error(tr("勇者と やくわりを えらんで", "Choose a hero and role"));
      party.quests.join(id, session, body.role, body.note, body.writer as boolean | undefined);
      partyJson(response, 200, partyView(party, id)); return;
    }
    if (action === "summary") {
      const session = party.quests.party(id).find((member) => member.writer)?.session ?? quest.session;
      if (!session) throw new Error(tr("担当を えらんで", "Choose an owner"));
      if (typeof body.text !== "string") throw new Error(tr("たしかめた 文を えらんで", "Choose the confirmed text"));
      partyJson(response, 200, { delivered: party.send(id, session, body.text) }); return;
    }
    if (action === "send" || action === "handoff") {
      if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 8000) throw new Error(tr("ことばは 1〜8000文字で", "Use 1–8000 characters"));
      let session = typeof body.session === "string" ? party.pty.getSession(body.session) : undefined;
      if (session) requirePartyConversation(session.preset);
      if (!session && action === "handoff" && body.preset && body.cwd) {
        requirePartyConversation(String(body.preset));
        const { projectIdentity } = await import("./project");
        if (typeof body.cwd !== "string" || (await projectIdentity(body.cwd)).key !== quest.town) throw new Error(tr("この町の 拠点を えらんで", "Choose a base in this town"));
        session = await party.pty.create({ preset: body.preset, cwd: body.cwd });
      }
      if (!session || !party.pty.agentSession(session.id)?.active || session.project !== quest.town) throw new Error(tr("この町の 勇者を えらんで", "Choose a hero in this town"));
      if (action === "handoff") {
        const old = party.quests.member(session.id);
        party.quests.join(id, session, old?.quest === id ? old.role : "implement", old?.quest === id ? old.note : "");
      }
      const delivered = party.send(id, session.id, body.text, action === "handoff" ? "handoff" : "request");
      if (action === "handoff" && body.writer === true) {
        const member = party.quests.member(session.id)!;
        party.quests.join(id, session, member.role, member.note, true);
      }
      partyJson(response, 200, { delivered, session }); return;
    }
    partyJson(response, 400, { error: tr("その コマンドは ない", "Unknown party command") });
  } catch (error) { partyJson(response, error instanceof TerminalOnlyError ? 409 : 400, { error: error instanceof Error ? error.message : "Party request failed" }); }
}
