import type { IncomingMessage, ServerResponse } from "node:http";
import { MAX_EVENT_TEXT_LENGTH, type AgentEvent } from "../core/events";
import { equipmentInput, type AgentEquipment } from "../core/equipment";
import { AGENTS } from "./agents";
import { act, deliver, parseSessionAction, pending } from "./pty-actions";
import { requestEquipment } from "./pty-equipment";
import type { EquippedMessage, PendingMessage, Session } from "./pty-session";

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(value));
}

export async function handlePtyAction(request: IncomingMessage, response: ServerResponse, path: string, session: Session,
  master: AgentEquipment, changed: (message: PendingMessage) => void, equipped: (message: EquippedMessage) => void,
  recordEvent: (event: AgentEvent) => void): Promise<boolean> {
  let body = "";
  request.setEncoding("utf8");
  try {
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 64 * 1024) { json(response, 400, { error: "送る内容が長すぎます" }); return false; }
    }
    const value: unknown = JSON.parse(body);
    if (session.info.exited || session.ended || session.departing || session.interrupting) {
      json(response, 409, { error: "この勇者は終了済み・旅立ち中・中断中のいずれかです" }); return false;
    }
    if (path.endsWith("/equip")) {
      const next = equipmentInput(value, master);
      try { json(response, 200, { delivered: requestEquipment(session, next, master, changed, equipped) }); }
      catch (error) { json(response, 409, { error: error instanceof Error ? error.message : "そうびを かえられません" }); }
      return false;
    }
    if (path.endsWith("/action")) {
      const action = parseSessionAction(value);
      if (action === "compact" && !AGENTS[session.info.preset].compact) { json(response, 409, { error: "この種類の勇者は会話の整理に対応していません" }); return false; }
      if (action === "interrupt" && !AGENTS[session.info.preset].hero) { json(response, 409, { error: "このターミナルは勇者のコマンドに対応していません" }); return false; }
      if (action === "compact" && !session.waiting) { json(response, 409, { error: "勇者は作業中です。終わってからやすませてください" }); return false; }
      await act(session, action, changed);
      if (action === "interrupt" && session.agentId) recordEvent({ state: "idle", hook: "Interrupt",
        agent: session.agentId, name: session.name, terminal: session.info.id, project: session.info.project,
        source: AGENTS[session.info.preset].source });
      json(response, 200, { ok: true }); return action === "farewell";
    }
    if (!AGENTS[session.info.preset].hero) { json(response, 409, { error: "このターミナルは町での会話に対応していません" }); return false; }
    const text = value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>).text : undefined;
    if (typeof text !== "string" || text.length < 1 || text.length > MAX_EVENT_TEXT_LENGTH) {
      json(response, 400, { error: "ことばは 1〜8000 文字で入力してください" }); return false;
    }
    const delivered = session.waiting;
    if (delivered) deliver(session, text);
    else { session.texts.push(text); changed(pending(session)); }
    json(response, 200, { delivered });
  } catch (error) {
    json(response, 400, { error: error instanceof SyntaxError ? "会話またはコマンドの内容が正しくありません"
      : error instanceof Error ? error.message : "送る内容が正しくありません" });
  }
  return false;
}
