import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import { MAX_EVENT_TEXT_LENGTH, type AgentEvent } from "../core/events";
import { WebSocket, WebSocketServer } from "ws";
import { appendOutput, dimensions, SESSION_LIMIT, sessionInput, type PendingMessage, type Session, type TerminalSession } from "./pty-session";
import { act, clearPending, deliver, observe as observeSession, parseSessionAction, pending } from "./pty-actions";
import { addRosterEntry, isClaudeSessionId } from "../core/roster";
import { readRoster, writeRoster } from "./town-data";
import { projectName } from "./project";
import { launchPty, writeClaudeSettings } from "./pty-launch";

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" })
    .end(JSON.stringify(value));
}

// Job control can give foreground jobs their own process group. Snapshot the tree before killing the shell.
function descendants(rootPid: number): number[] {
  try {
    const rows = execFileSync("ps", ["-A", "-o", "pid=,ppid="], { encoding: "utf8", timeout: 1000 })
      .trim().split("\n").map((row) => row.trim().split(/\s+/).map(Number));
    const tree = new Set([rootPid]);
    for (const parent of tree) {
      for (const [pid, ppid] of rows) if (ppid === parent && pid > 0) tree.add(pid);
    }
    tree.delete(rootPid);
    return [...tree];
  } catch (error) {
    console.error("PTY descendant lookup failed:", error instanceof Error ? error.message : String(error));
    return [];
  }
}

export function createPtyServer(port: number, registerTown: (session: TerminalSession) => void,
  pendingChanged: (message: PendingMessage) => void, recordEvent: (event: AgentEvent) => void,
  terminalEnded: (terminal: string) => void, chosenName: (id: string) => string | undefined) {
  const temporary = mkdtempSync(join(tmpdir(), "agent-character-"));
  const settings = writeClaudeSettings(port, temporary);
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const sessions = new Map<string, Session>();
  const kills = new Set<ReturnType<typeof setTimeout>>();
  const groups = new Set<number>();
  const children = new Set<number>();
  let disposed = false;
  let roster = readRoster();
  const recalling = new Set<string>();

  function rememberDeparture(session: Session): void {
    if (session.info.preset !== "claude" || !session.hasPrompt || !isClaudeSessionId(session.claudeId)) return;
    try {
      const { project, cwd } = session.info;
      const updated = addRosterEntry(roster, { sessionId: session.claudeId,
        name: chosenName(session.claudeId) ?? session.name, project, cwd, leftAt: Date.now() });
      writeRoster(updated);
      roster = updated;
    } catch (error) { console.error("Roster save failed:", error); }
  }

  function observe(event: AgentEvent, at: number): void {
    const session = event.terminal ? sessions.get(event.terminal) : undefined;
    if (session) observeSession(session, event, at, pendingChanged);
  }

  function killPid(pid: number, signal: NodeJS.Signals): void {
    try { process.kill(pid, signal); } catch { /* Already exited. */ }
  }

  function killGroup(pid: number, signal: NodeJS.Signals): void {
    try { process.kill(-pid, signal); } catch { /* Already exited. */ }
  }

  async function create(input: unknown, resume?: string): Promise<TerminalSession> {
    const { preset, cwd = process.env.AGENT_CHARACTER_CWD || process.env.INIT_CWD || process.cwd() } = sessionInput(input);
    if (!isAbsolute(cwd)) throw new Error("cwd must be an absolute directory path");
    try {
      if (!statSync(cwd).isDirectory()) throw new Error();
    } catch { throw new Error("cwd must be an existing directory"); }
    const project = await projectName(cwd);
    // Check after the await too: concurrent requests must not exceed the limit.
    if (disposed) throw new Error("Server is stopping");
    if (sessions.size >= SESSION_LIMIT) throw new Error("Session limit reached (16)");
    const id = randomBytes(6).toString("hex");
    const terminal = launchPty(preset, cwd, id, port, settings, resume);
    groups.add(terminal.pid);
    let stopped = false;
    const stop = (): void => {
      if (stopped) return;
      stopped = true;
      clearTimeout(session.enter);
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
      info: { id, preset, cwd, project, createdAt: Date.now() }, terminal,
      output: Buffer.alloc(0), clients: new Set(), stop, waiting: false, eventAt: -Infinity, texts: [],
      interrupted: false, interrupting: false, departing: false, claudeId: resume,
      hasPrompt: Boolean(resume), name: basename(cwd), finished, finish,
    };
    sessions.set(id, session);
    const output = (data: string): void => {
      session.output = appendOutput(session.output, data);
      for (const client of session.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(data);
      }
    };
    terminal.onData(output);
    terminal.onExit(({ exitCode }) => {
      session.info.exited = { code: exitCode };
      stop();
      output(`\r\n[終了: ${exitCode}]\r\n`);
      for (const client of session.clients) client.close(1000, "Process exited");
      rememberDeparture(session);
      // Also remove the hero when termination bypasses Claude's SessionEnd hook.
      if (preset === "claude" && session.claudeId && !session.ended) recordEvent({ state: "idle", hook: "SessionEnd",
        agent: session.claudeId, name: session.name, terminal: id, project, source: "claude-code" });
      terminalEnded(id);
      session.finish();
    });
    try { if (preset !== "shell") registerTown(session.info); }
    catch (error) { sessions.delete(id); stop(); throw error; }
    return session.info;
  }

  async function handleRequest(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    if (url.pathname === "/api/sessions" && request.method === "GET") {
      json(response, 200, [...sessions.values()].map((session) => session.info));
    } else if (url.pathname === "/api/sessions" && request.method === "POST") {
      let body = "";
      request.setEncoding("utf8");
      try {
        for await (const chunk of request) {
          body += chunk;
          if (body.length > 4096) { json(response, 413, { error: "Body too large" }); return; }
        }
        const info = await create(JSON.parse(body));
        json(response, 201, info);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        json(response, message.startsWith("Session limit") ? 409 : 400, { error: message });
      }
    } else if (url.pathname === "/api/roster" && request.method === "GET") {
      json(response, 200, roster);
    } else if (url.pathname.startsWith("/api/roster/") && url.pathname.endsWith("/recall") && request.method === "POST") {
      let sessionId: string;
      try { sessionId = decodeURIComponent(url.pathname.slice("/api/roster/".length, -"/recall".length)); }
      catch { json(response, 400, { error: "Invalid Claude sessionId" }); return; }
      if (!isClaudeSessionId(sessionId)) { json(response, 400, { error: "Invalid Claude sessionId" }); return; }
      const entry = roster.find((item) => item.sessionId === sessionId);
      if (!entry) { json(response, 404, { error: "Unknown roster entry" }); return; }
      if (recalling.has(sessionId)) { json(response, 409, { error: "Recall in progress" }); return; }
      recalling.add(sessionId);
      try {
        const info = await create({ preset: "claude", cwd: entry.cwd }, sessionId);
        try {
          const updated = roster.filter((item) => item.sessionId !== sessionId);
          writeRoster(updated);
          roster = updated;
        } catch (error) {
          sessions.get(info.id)?.stop();
          sessions.delete(info.id);
          console.error("Roster save failed:", error);
          json(response, 500, { error: "Could not save roster" }); return;
        }
        json(response, 201, info);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        json(response, message.startsWith("Session limit") ? 409 : 400, { error: message });
      } finally { recalling.delete(sessionId); }
    } else if (/^\/api\/sessions\/[^/]+\/(say|action)$/.test(url.pathname) && request.method === "POST") {
      const session = sessions.get(url.pathname.split("/")[3]);
      if (!session) { json(response, 404, { error: "Unknown session" }); return; }
      let body = "";
      request.setEncoding("utf8");
      try {
        for await (const chunk of request) {
          body += chunk;
          if (body.length > 64 * 1024) { json(response, 400, { error: "Body too large" }); return; }
        }
        const value: unknown = JSON.parse(body);
        if (session.info.exited || session.ended || session.departing || session.interrupting || sessions.get(session.info.id) !== session) {
          json(response, 409, { error: "Session exited, departing or interrupting" }); return;
        }
        if (url.pathname.endsWith("/action")) {
          const action = parseSessionAction(value);
          if (action === "compact" && !session.waiting) { json(response, 409, { error: "Session is working" }); return; }
          await act(session, action, pendingChanged);
          if (action === "farewell") sessions.delete(session.info.id);
          // Claude sends no hook when Esc stops a turn, so tell the town the hero stopped.
          if (action === "interrupt" && session.claudeId) recordEvent({ state: "idle", hook: "Interrupt",
            agent: session.claudeId, name: session.name, terminal: session.info.id, project: session.info.project,
            source: "claude-code" });
          json(response, 200, { ok: true }); return;
        }
        const text = value && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, unknown>).text : undefined;
        if (typeof text !== "string" || text.length < 1 || text.length > MAX_EVENT_TEXT_LENGTH) {
          json(response, 400, { error: "text must be a string of 1–8000 characters" }); return;
        }
        const delivered = session.waiting;
        if (delivered) deliver(session, text);
        else { session.texts.push(text); pendingChanged(pending(session)); }
        json(response, 200, { delivered });
      } catch { json(response, 400, { error: "Invalid conversation request" }); }
    } else if (url.pathname.startsWith("/api/sessions/") && request.method === "DELETE") {
      const id = url.pathname.slice("/api/sessions/".length);
      const session = sessions.get(id);
      if (!session) { json(response, 404, { error: "Unknown session" }); return; }
      sessions.delete(id);
      session.stop();
      for (const client of session.clients) client.close(1000, "Session deleted");
      response.writeHead(204).end();
    } else {
      response.writeHead(405, { Allow: "GET, POST, DELETE" }).end();
    }
  }

  sockets.on("connection", (client, request) => {
    client.on("error", (error) => console.error("PTY WebSocket error:", error.message));
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
    const session = sessions.get(url.searchParams.get("session") ?? "");
    if (!session) { client.close(1008, "Unknown session"); return; }
    // Replay is queued before any live output (all callbacks run on the same event loop).
    if (session.output.length) client.send(session.output.toString("utf8"));
    if (session.info.exited) { client.close(1000, "Process exited"); return; }
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
    pending: () => [...sessions.values()].filter((session) => session.texts.length).map(pending),
    getSession: (id: string) => sessions.get(id)?.info,
    activeProjects: () => new Set([...sessions.values()]
      .filter((session) => !session.info.exited && session.info.preset !== "shell").map((session) => session.info.project)),
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
