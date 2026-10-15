import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { agentAuthorized, agentTokenBytes, partyRole } from "../core/party";
import { TerminalOnlyError, type QuestParty } from "./party";
import { partyBody, partyJson, partyView } from "./party-api";
import { projectIdentity } from "./project";
import { sessionInput } from "./pty-session";
import { tr } from "./language";

export async function handleAgentQuest(request: IncomingMessage, response: ServerResponse, url: URL, party: QuestParty): Promise<void> {
  try {
    const session = typeof request.headers["x-agent-session"] === "string" ? request.headers["x-agent-session"] : "";
    const identity = party.pty.agentSession(session), member = party.quests.member(session);
    const expected = agentTokenBytes(identity?.token), supplied = agentTokenBytes(request.headers.authorization?.replace(/^Bearer /, ""));
    const matches = Boolean(expected && supplied && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied)));
    const parts = url.pathname.split("/"), id = (!parts[4] || parts[4] === "current" ? member?.quest : parts[4]) || "", action = parts[5] || "read";
    if (!agentAuthorized(matches, Boolean(identity?.active), member, id, action)) {
      partyJson(response, 403, { error: tr("この 道具は つかえない", "This tool is not allowed") }); return;
    }
    const quest = party.quests.get(id);
    if (!quest) { partyJson(response, 404, { error: "Quest not found" }); return; }
    if (action === "read" && request.method === "GET") {
      const { events, ...summary } = quest;
      partyJson(response, 200, { ...summary, party: partyView(party, id), events: events.map(({ text: _text, ...event }) => event) }); return;
    }
    if (request.method !== "POST") { response.writeHead(405).end(); return; }
    const body = await partyBody(request, response); if (!body) return;
    if (action === "note") {
      if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 2000) throw new Error(tr("覚え書きは 1〜2000文字で", "Use 1–2000 characters for notes"));
      party.quests.addEvent(id, { kind: "note", title: body.text, at: Date.now(), session, hero: member?.hero });
      partyJson(response, 200, { ok: true, message: tr("おぼえた", "Note saved") }); return;
    }
    if (action === "review") { const quest = party.quests.patch(id, { state: "review" }); partyJson(response, 200, { state: quest.state }); return; }
    if (action === "send") {
      if (typeof body.session !== "string" || typeof body.text !== "string") throw new Error("Choose a party hero and text");
      partyJson(response, 200, { delivered: party.send(id, body.session, body.text, "command", session) }); return;
    }
    if (action === "invite") {
      if (!partyRole(body.role) || body.note !== undefined && (typeof body.note !== "string" || body.note.length > 200)) throw new Error("Choose a role and short note");
      if (typeof body.session === "string") {
        const chosen = party.pty.getSession(body.session);
        if (!chosen || !party.pty.agentSession(chosen.id)?.active || chosen.project !== quest.town) throw new Error(tr("この町の 勇者を えらんで", "Choose a hero in this town"));
      } else {
        const input = sessionInput({ preset: body.preset, cwd: body.cwd });
        if (!input.cwd || (await projectIdentity(input.cwd)).key !== quest.town) throw new Error(tr("この町の 拠点を えらんで", "Choose a base in this town"));
      }
      // Validate again after filesystem IO; no late commander may leave a valid invitation.
      if (!agentAuthorized(matches, Boolean(party.pty.agentSession(session)?.active), party.quests.member(session), id, "invite")) { partyJson(response, 403, { error: "This tool is not allowed" }); return; }
      const invite = party.invite({ quest: id, from: session, role: body.role, note: typeof body.note === "string" ? body.note : "",
        ...(typeof body.session === "string" ? { session: body.session } : { preset: String(body.preset), cwd: String(body.cwd) }) });
      partyJson(response, 202, { id: invite.id, pending: true, message: tr("でんれいで 人の はいを まつ", "Awaiting a human yes at the herald") }); return;
    }
    partyJson(response, 403, { error: "This tool is not allowed" });
  } catch (error) { partyJson(response, error instanceof TerminalOnlyError ? 409 : 400, { error: error instanceof Error ? error.message : "Quest tool failed" }); }
}
