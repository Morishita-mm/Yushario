import { serverLanguage, tr } from "./language";
import type { IncomingMessage, ServerResponse } from "node:http";
import { MAX_EVENT_TEXT_LENGTH, type AgentEvent } from "../core/events";
import { equipmentInput, type AgentEquipment } from "../core/equipment";
import { AGENTS } from "./agents";
import { act, parseSessionAction, say } from "./pty-actions";
import { requestEquipment } from "./pty-equipment";
import type { EquippedMessage, PendingMessage, Session, TerminalSession } from "./pty-session";
import { ACTION_BODY_LIMIT, readJsonBody } from "./http-body";

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(value));
}

export async function handlePtyAction(request: IncomingMessage, response: ServerResponse, path: string, session: Session,
  master: AgentEquipment, changed: (message: PendingMessage) => void, equipped: (message: EquippedMessage) => void,
  recordEvent: (event: AgentEvent) => void,
  requested?: (session: TerminalSession, text: string, hero?: string) => void): Promise<boolean> {
  const body = await readJsonBody(request, response, ACTION_BODY_LIMIT);
  if (!body.ok) return false;
  try {
    const value = body.value;
    if (session.info.exited || session.ended || session.departing || session.interrupting) {
      json(response, 409, { error: tr("この勇者は終了済み・旅立ち中・中断中のいずれかです", "This hero has ended, is leaving, or is interrupted") }); return false;
    }
    if (path.endsWith("/equip")) {
      const next = equipmentInput(value, master, serverLanguage());
      try { json(response, 200, { delivered: requestEquipment(session, next, master, changed, equipped) }); }
      catch (error) { json(response, 409, { error: error instanceof Error ? error.message : tr("そうびを かえられません", "Cannot change equipment") }); }
      return false;
    }
    if (path.endsWith("/action")) {
      const action = parseSessionAction(value);
      if (action === "compact" && !AGENTS[session.info.preset].compact) { json(response, 409, { error: tr("この種類の勇者は会話の整理に対応していません", "This hero cannot rest") }); return false; }
      if (action === "interrupt" && !AGENTS[session.info.preset].hero) { json(response, 409, { error: tr("このターミナルは勇者のコマンドに対応していません", "This terminal has no hero commands") }); return false; }
      if (action === "compact" && !session.waiting) { json(response, 409, { error: tr("勇者は作業中です。終わってからやすませてください", "Your hero is busy. Rest after battle") }); return false; }
      await act(session, action, changed);
      if (action === "interrupt" && session.agentId) recordEvent({ state: "working", hook: "Interrupt",
        agent: session.agentId, name: session.name, terminal: session.info.id, project: session.info.project,
        source: AGENTS[session.info.preset].source });
      json(response, 200, { ok: true }); return action === "farewell";
    }
    if (!AGENTS[session.info.preset].hero) { json(response, 409, { error: tr("このターミナルは町での会話に対応していません", "This terminal cannot talk in town") }); return false; }
    const fields = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const text = fields.text;
    if (typeof text !== "string" || text.length < 1 || text.length > MAX_EVENT_TEXT_LENGTH) {
      json(response, 400, { error: tr("ことばは 1〜8000 文字で入力してください", "Use 1–8000 characters") }); return false;
    }
    // steer: tell a working hero now; the CLI reads it after the current tool (Claude Code and pi queue typed input).
    const steer = fields.steer === true && !session.waiting;
    if (steer && session.asking) {
      json(response, 409, { error: tr("勇者が あなたの へんじを まっています。さきに こたえてください", "Your hero awaits your answer. Answer first") }); return false;
    }
    requested?.(session.info, text, session.agentId);
    const delivered = say(session, text, changed, steer);
    json(response, 200, { delivered });
  } catch (error) {
    json(response, 400, { error: error instanceof SyntaxError ? tr("会話またはコマンドの内容が正しくありません", "Invalid talk or command")
      : error instanceof Error ? error.message : tr("送る内容が正しくありません", "Invalid message") });
  }
  return false;
}
