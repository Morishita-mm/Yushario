import { serverLanguage, tr } from "./language";
import type { IncomingMessage, ServerResponse } from "node:http";
import { MAX_EVENT_TEXT_LENGTH, type AgentEvent } from "../core/events";
import { equipmentInput, type AgentEquipment } from "../core/equipment";
import { AGENTS } from "./agents";
import { conversationText } from "../core/terminal-session";
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
      json(response, 409, { error: tr("この勇者は 終了済み・旅立ち中・中断中。", "This hero has ended, is leaving, or is interrupted") }); return false;
    }
    if (path.endsWith("/equip")) {
      const next = equipmentInput(value, master, serverLanguage());
      try { json(response, 200, { delivered: requestEquipment(session, next, master, changed, equipped) }); }
      catch (error) { json(response, 409, { error: error instanceof Error ? error.message : tr("そうびを 変えられない。", "Cannot change equipment") }); }
      return false;
    }
    if (path.endsWith("/action")) {
      const action = parseSessionAction(value);
      if (action === "compact" && !AGENTS[session.info.preset].compact) { json(response, 409, { error: tr("この勇者は 会話の整理に対応していない。", "This hero cannot summarize the conversation") }); return false; }
      if (action === "interrupt" && !AGENTS[session.info.preset].hero) { json(response, 409, { error: tr("このターミナルでは 勇者のコマンドを使えない。", "This terminal has no hero commands") }); return false; }
      if (action === "compact" && session.asking) { json(response, 409, { error: tr("勇者が へんじを待っている。先にこたえよう。", "Your hero awaits your answer. Answer first") }); return false; }
      if (action === "compact" && !session.waiting) { json(response, 409, { error: tr("勇者は作業中。終わってから やすませよう。", "Your hero is busy. Rest after battle") }); return false; }
      await act(session, action, changed);
      if (action === "interrupt" && session.agentId) recordEvent({ state: "working", hook: "Interrupt",
        agent: session.agentId, name: session.name, terminal: session.info.id, project: session.info.project,
        source: AGENTS[session.info.preset].source });
      json(response, 200, { ok: true }); return action === "farewell";
    }
    if (!AGENTS[session.info.preset].hero) { json(response, 409, { error: tr("このターミナルは 町での会話に対応していない。", "This terminal cannot talk in town") }); return false; }
    const fields = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const text = typeof fields.text === "string" ? conversationText(fields.text) : undefined;
    if (!text || (fields.text as string).length > MAX_EVENT_TEXT_LENGTH) {
      json(response, 400, { error: tr("ことばは 1〜8000文字で。", "Use 1–8000 characters") }); return false;
    }
    // steer: tell a working hero now; the CLI reads it after the current tool (Claude Code and pi queue typed input).
    const steer = fields.steer === true;
    if (steer && !session.hasMainHook) {
      json(response, 409, { error: tr("起動を まだ確認できない。ターミナルで 信頼・起動の確認をしよう。", "Startup is not confirmed. Check trust and startup in the terminal first") }); return false;
    }
    if (steer && session.asking) {
      json(response, 409, { error: tr("勇者が へんじを待っている。先にこたえよう。", "Your hero awaits your answer. Answer first") }); return false;
    }
    requested?.(session.info, text, session.agentId);
    const delivered = say(session, text, changed, steer);
    json(response, 200, { delivered });
  } catch (error) {
    json(response, 400, { error: error instanceof SyntaxError ? tr("会話かコマンドの内容が 正しくない。", "Invalid talk or command")
      : error instanceof Error ? error.message : tr("送る内容が 正しくない。", "Invalid message") });
  }
  return false;
}
