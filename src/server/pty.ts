import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import type { AgentEvent } from "../core/events";
import { equipmentInput } from "../core/equipment";
import { WebSocket, WebSocketServer } from "ws";
import { appendOutput, dimensions, SESSION_LIMIT, sessionInput, type EquippedMessage, type PendingMessage, type Session, type TerminalSession } from "./pty-session";
import { clearPending, observe as observeSession, pending } from "./pty-actions";
import { flushEquipment } from "./pty-equipment";
import { handlePtyAction } from "./pty-api-actions";
import { addRosterEntry, isClaudeSessionId } from "../core/roster";
import { readEquipment, readRoster, writeRoster } from "./town-data";
import { projectName } from "./project";
import { launchPty, writeClaudeSettings } from "./pty-launch";
import { AGENTS, publicAgents } from "./agents";
import { hasTrustPrompt, replacedSession } from "../core/session-actions";
import { descendants } from "./pty-process";

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" })
    .end(JSON.stringify(value));
}

export function createPtyServer(port: number, registerTown: (session: TerminalSession) => void,
  pendingChanged: (message: PendingMessage) => void, recordEvent: (event: AgentEvent) => void,
  terminalEnded: (terminal: string) => void, chosenName: (id: string) => string | undefined,
  attentionChanged: (message: { type: "attention"; terminal: string; reason: "trust" }) => void,
  equipmentChanged: (message: EquippedMessage) => void) {
  const temporary = mkdtempSync(join(tmpdir(), "agent-character-"));
  const settings = writeClaudeSettings(port, temporary);
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const sessions = new Map<string, Session>();
  const kills = new Set<ReturnType<typeof setTimeout>>();
  const groups = new Set<number>();
  const children = new Set<number>();
  let disposed = false;
  let roster = readRoster();
  const equipment = readEquipment();
  const recalling = new Set<string>();

  function rememberDeparture(session: Session): void {
    if (!AGENTS[session.info.preset].resume || !session.hasPrompt || !isClaudeSessionId(session.agentId)) return;
    try {
      const { project, cwd } = session.info;
      const updated = addRosterEntry(roster, { sessionId: session.agentId,
        name: chosenName(session.agentId) ?? session.name, project, cwd, leftAt: Date.now(),
        weapon: session.info.weapon, accessory: session.info.accessory })
        .map((entry) => entry.sessionId === session.agentId ? { ...entry, preset: session.info.preset } : entry);
      writeRoster(updated);
      roster = updated;
    } catch (error) { console.error("Roster save failed:", error); }
  }

  function observe(event: AgentEvent, at: number): void {
    const session = event.terminal ? sessions.get(event.terminal) : undefined;
    if (!session) return;
    const previous = replacedSession(event, session.agentId);
    if (previous) {
      rememberDeparture(session);
      // Retire only the conversation: terminal-bearing SessionEnd would block the new one.
      recordEvent({ state: "idle", hook: "SessionEnd", agent: previous, name: session.name,
        project: session.info.project, source: AGENTS[session.info.preset].source });
      clearTimeout(session.enter); session.enter = undefined; session.equipping = undefined;
      clearPending(session, pendingChanged);
      session.hasPrompt = false; session.ended = false; session.interrupted = false;
      session.eventAt = -Infinity; session.name = basename(session.info.cwd);
    }
    observeSession(session, event, at, pendingChanged,
      (sendHeldText) => void flushEquipment(session, equipment[session.info.preset], pendingChanged, equipmentChanged, sendHeldText));
  }

  function killPid(pid: number, signal: NodeJS.Signals): void {
    try { process.kill(pid, signal); } catch { /* Already exited. */ }
  }

  function killGroup(pid: number, signal: NodeJS.Signals): void {
    try { process.kill(-pid, signal); } catch { /* Already exited. */ }
  }

  async function create(input: unknown, resume?: string): Promise<TerminalSession> {
    const { preset, cwd = process.env.AGENT_CHARACTER_CWD || process.env.INIT_CWD || process.cwd() } = sessionInput(input);
    if (!isAbsolute(cwd)) throw new Error("行き先はフォルダの絶対パスで指定してください");
    try {
      if (!statSync(cwd).isDirectory()) throw new Error();
    } catch { throw new Error("行き先のフォルダが見つかりません。存在するフォルダを指定してください"); }
    const selectedEquipment = equipmentInput(input, equipment[preset]);
    const project = await projectName(cwd);
    // Check after the await too: concurrent requests must not exceed the limit.
    if (disposed) throw new Error("サーバーは停止中です");
    if (sessions.size >= SESSION_LIMIT) throw new Error("ターミナルの上限（16）に達しました。使わないものを終わらせて消してください");
    const id = randomBytes(6).toString("hex");
    const terminal = launchPty(preset, cwd, id, port, settings, selectedEquipment, equipment[preset], resume);
    groups.add(terminal.pid);
    let stopped = false;
    const stop = (): void => {
      if (stopped) return;
      stopped = true; session.departing = true;
      clearTimeout(session.enter); session.equipping = undefined;
      clearPending(session, pendingChanged);
      const pids = descendants(terminal.pid);
      for (const pid of pids) { children.add(pid); killPid(pid, "SIGHUP"); }
      // Keep the original group cleanup too, including jobs that are not in the snapshot.
      killGroup(terminal.pid, "SIGHUP");
      try { terminal.kill(); } catch { /* Already exited. */ }
      const timer = setTimeout(() => {
        for (const pid of pids) { killPid(pid, "SIGKILL"); children.delete(pid); }
        killGroup(terminal.pid, "SIGKILL");
        groups.delete(terminal.pid);
        kills.delete(timer);
      }, 500);
      kills.add(timer);
    };
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => { finish = resolve; });
    const session: Session = {
      info: { id, preset, cwd, project, createdAt: Date.now(), ...selectedEquipment }, terminal,
      output: Buffer.alloc(0), clients: new Set(), stop, waiting: false, eventAt: -Infinity, texts: [],
      interrupted: false, interrupting: false, departing: false, agentId: resume,
      hasPrompt: Boolean(resume), name: basename(cwd), finished, finish,
    };
    sessions.set(id, session);
    const output = (data: string): void => {
      session.output = appendOutput(session.output, data);
      if (!session.attention && !session.agentId && !session.info.exited && AGENTS[preset].hero && hasTrustPrompt(session.output.toString("utf8").slice(-8192))) {
        session.attention = true;
        attentionChanged({ type: "attention", terminal: id, reason: "trust" });
      }
      for (const client of session.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(data);
      }
    };
    terminal.onData(output);
    terminal.onExit(({ exitCode }) => {
      session.info.exited = { code: exitCode };
      stop();
      output(`\r\n[終了: ${exitCode}]\r\n`);
      for (const client of session.clients) client.close(1000, "終了しました");
      rememberDeparture(session);
      // Every town-capable agent departs even if its own shutdown event never arrived.
      if (AGENTS[preset].hero && session.agentId && !session.ended) recordEvent({ state: "idle", hook: "SessionEnd",
        agent: session.agentId, name: session.name, terminal: id, project, source: AGENTS[preset].source });
      terminalEnded(id);
      session.finish();
    });
    try { if (AGENTS[preset].hero) registerTown(session.info); }
    catch { sessions.delete(id); stop(); throw new Error("町の記録を保存できませんでした。データフォルダの権限を確認してください"); }
    return session.info;
  }

  async function handleRequest(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    if (url.pathname === "/api/equipment" && request.method === "GET") {
      json(response, 200, equipment);
    } else if (url.pathname === "/api/agents" && request.method === "GET") {
      json(response, 200, publicAgents());
    } else if (url.pathname === "/api/sessions" && request.method === "GET") {
      json(response, 200, [...sessions.values()].map((session) => session.info));
    } else if (url.pathname === "/api/sessions" && request.method === "POST") {
      let body = "";
      request.setEncoding("utf8");
      try {
        for await (const chunk of request) {
          body += chunk;
          if (body.length > 4096) { json(response, 413, { error: "送る内容が長すぎます" }); return; }
        }
        const info = await create(JSON.parse(body));
        json(response, 201, info);
      } catch (error) {
        const message = error instanceof SyntaxError ? "起動の設定を JSON で指定してください" : error instanceof Error ? error.message : "起動できませんでした";
        json(response, message.startsWith("ターミナルの上限") ? 409 : 400, { error: message });
      }
    } else if (url.pathname === "/api/roster" && request.method === "GET") {
      json(response, 200, roster);
    } else if (url.pathname.startsWith("/api/roster/") && url.pathname.endsWith("/recall") && request.method === "POST") {
      let sessionId: string;
      try { sessionId = decodeURIComponent(url.pathname.slice("/api/roster/".length, -"/recall".length)); }
      catch { json(response, 400, { error: "勇者の ID が正しくありません" }); return; }
      if (!isClaudeSessionId(sessionId)) { json(response, 400, { error: "勇者の ID が正しくありません" }); return; }
      const entry = roster.find((item) => item.sessionId === sessionId);
      if (!entry) { json(response, 404, { error: "めいぼにその勇者が見つかりません" }); return; }
      if (recalling.has(sessionId)) { json(response, 409, { error: "この勇者はよびもどしている途中です" }); return; }
      recalling.add(sessionId);
      try {
        const info = await create({ preset: entry.preset ?? "claude", cwd: entry.cwd,
          weapon: entry.weapon, accessory: entry.accessory }, sessionId);
        try {
          const updated = roster.filter((item) => item.sessionId !== sessionId);
          writeRoster(updated);
          roster = updated;
        } catch (error) {
          sessions.get(info.id)?.stop();
          sessions.delete(info.id);
          console.error("Roster save failed:", error);
          json(response, 500, { error: "めいぼを保存できませんでした" }); return;
        }
        json(response, 201, info);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        json(response, message.startsWith("ターミナルの上限") ? 409 : 400, { error: message });
      } finally { recalling.delete(sessionId); }
    } else if (/^\/api\/sessions\/[^/]+\/(say|action|equip)$/.test(url.pathname) && request.method === "POST") {
      const session = sessions.get(url.pathname.split("/")[3]);
      if (!session) { json(response, 404, { error: "そのターミナルが見つかりません" }); return; }
      const departed = await handlePtyAction(request, response, url.pathname, session,
        equipment[session.info.preset], pendingChanged, equipmentChanged, recordEvent);
      if (departed) sessions.delete(session.info.id);
    } else if (url.pathname.startsWith("/api/sessions/") && request.method === "DELETE") {
      const id = url.pathname.slice("/api/sessions/".length);
      const session = sessions.get(id);
      if (!session) { json(response, 404, { error: "そのターミナルが見つかりません" }); return; }
      sessions.delete(id);
      session.stop();
      for (const client of session.clients) client.close(1000, "ターミナルを終了して消しました");
      response.writeHead(204).end();
    } else {
      response.writeHead(405, { Allow: "GET, POST, DELETE" }).end();
    }
  }

  sockets.on("connection", (client, request) => {
    client.on("error", (error) => console.error("PTY WebSocket error:", error.message));
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
    const session = sessions.get(url.searchParams.get("session") ?? "");
    if (!session) { client.close(1008, "そのターミナルが見つかりません"); return; }
    // Replay is queued before any live output (all callbacks run on the same event loop).
    if (session.output.length) client.send(session.output.toString("utf8"));
    if (session.info.exited) { client.close(1000, "終了しました"); return; }
    session.clients.add(client);
    const size = dimensions(Number(url.searchParams.get("cols")), Number(url.searchParams.get("rows")));
    if (size) {
      try { session.terminal.resize(size.cols, size.rows); } catch { /* Process exited. */ }
    }
    client.on("message", (data, binary) => {
      if (session.info.exited || binary || !sessions.has(session.info.id)) return;
      try {
        const message = JSON.parse(String(data));
        // Drop input during Esc restoration; resize remains safe and input is not queued.
        if (message?.type === "input" && typeof message.data === "string" && !session.interrupting) session.terminal.write(message.data);
        else if (message?.type === "resize") {
          const size = dimensions(message.cols, message.rows);
          if (size) session.terminal.resize(size.cols, size.rows);
        }
      } catch { /* Ignore invalid messages and races with process exit. */ }
    });
    client.once("close", () => session.clients.delete(client));
  });
  sockets.on("error", (error) => console.error("PTY server error:", error.message));
  return {
    sockets, handleRequest, observe,
    pending: () => [...sessions.values()].filter((session) => session.texts.length || session.pendingEquipment).map(pending),
    attention: () => [...sessions.values()].filter((session) => session.attention && !session.agentId && !session.info.exited)
      .map((session) => ({ type: "attention", terminal: session.info.id, reason: "trust" })),
    getSession: (id: string) => sessions.get(id)?.info,
    activeProjects: () => new Set([...sessions.values()]
      .filter((session) => !session.info.exited && AGENTS[session.info.preset].hero).map((session) => session.info.project)),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const session of sessions.values()) {
        session.stop();
        // Shutdown may exit Node before node-pty can emit onExit; the child is being killed here.
        if (!session.info.exited) rememberDeparture(session);
      }
      sessions.clear();
      for (const timer of kills) clearTimeout(timer);
      for (const pid of children) killPid(pid, "SIGKILL");
      for (const pid of groups) killGroup(pid, "SIGKILL");
      for (const client of sockets.clients) client.terminate();
      sockets.close();
      rmSync(temporary, { recursive: true, force: true });
    },
  };
}
