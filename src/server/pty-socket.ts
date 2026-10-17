import type { IncomingMessage } from "node:http";
import { WebSocket } from "ws";
import { modePrefix } from "../core/terminal-modes";
import { hasTrustPrompt } from "../core/session-actions";
import { AGENTS } from "./agents";
import { appendOutput, dimensions, type Session } from "./pty-session";
import { capturePreviewUrls } from "./preview-output";
import { tr } from "./language";

export function relayOutput(session: Session, data: string, port: number,
  attentionChanged: (message: { type: "attention"; terminal: string; reason: "trust" }) => void): void {
  session.output = appendOutput(session.output, data, session.modes);
  capturePreviewUrls(session, data, port);
  if (!session.attention && !session.agentId && !session.info.exited && AGENTS[session.info.preset].hero && hasTrustPrompt(session.output.toString("utf8").slice(-8192))) {
    session.attention = true;
    attentionChanged({ type: "attention", terminal: session.info.id, reason: "trust" });
  }
  for (const client of session.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  }
}

export function connectTerminal(client: WebSocket, request: IncomingMessage, port: number, sessions: Map<string, Session>): void {
  client.on("error", (error) => console.error("PTY WebSocket error:", error.message));
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  const session = sessions.get(url.searchParams.get("session") ?? "");
  if (!session) { client.close(1008, tr("そのターミナルが 見つからない。", "Terminal not found")); return; }
  // Replay is queued before any live output (all callbacks run on the same event loop).
  if (session.output.length) client.send(modePrefix(session.modes) + session.output.toString("utf8"));
  if (session.info.exited) { client.close(1000, tr("終了した。", "Ended")); return; }
  session.clients.add(client);
  const size = dimensions(Number(url.searchParams.get("cols")), Number(url.searchParams.get("rows")));
  if (size) {
    try { session.terminal.resize(size.cols, size.rows); } catch { /* Process exited. */ }
  }
  client.on("message", (data, binary) => receiveTerminalInput(session, sessions, data, binary));
  client.once("close", () => session.clients.delete(client));
}

function receiveTerminalInput(session: Session, sessions: Map<string, Session>, data: unknown, binary: boolean): void {
  if (session.info.exited || binary || !sessions.has(session.info.id)) return;
  try {
    const message = JSON.parse(String(data));
    // The terminal remains usable to inspect or recover an unconfirmed stop.
    if (message?.type === "input" && typeof message.data === "string") session.terminal.write(message.data);
    else if (message?.type === "resize") {
      const size = dimensions(message.cols, message.rows);
      if (size) session.terminal.resize(size.cols, size.rows);
    }
  } catch { /* Ignore invalid messages and races with process exit. */ }
}
