import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { accessSync, constants, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node-pty";
import { WebSocket, WebSocketServer } from "ws";
import { appendOutput, dimensions, SESSION_LIMIT, sessionInput, type TerminalSession } from "./pty-session";
import { projectName } from "./project";

const root = fileURLToPath(new URL("../../", import.meta.url));
// Keep user configuration (e.g. CLAUDE_CODE_USE_BEDROCK), but not inherited child-session markers.
const serverOnlyEnvironment = ["TYPESAFE_API_KEY", "AGENT_CHARACTER_TOKEN", "CLAUDE_CODE_CHILD_SESSION", "CLAUDECODE"];

function executable(command: string): string | undefined {
  const paths = command.includes("/") ? [command]
    : (process.env.PATH ?? "").split(delimiter).map((directory) => join(directory, command));
  return paths.find((path) => {
    try { accessSync(path, constants.X_OK); return true; } catch { return false; }
  });
}

// Both shells and Claude's hook runner interpret this command; quote absolute paths safely.
function quote(value: string): string { return `'${value.replaceAll("'", "'\\''")}'`; }

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

type Session = {
  info: TerminalSession; terminal: ReturnType<typeof spawn>; output: Buffer;
  clients: Set<WebSocket>; stop: () => void;
};

export function createPtyServer(port: number, registerTown: (session: TerminalSession) => void) {
  const temporary = mkdtempSync(join(tmpdir(), "agent-character-"));
  const settings = join(temporary, "claude-settings.json");
  const command = `${quote(process.execPath)} ${quote(join(root, "adapters/claude-code/hook.mjs"))}`;
  const hooks = Object.fromEntries([
    "SessionStart", "SessionEnd", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure",
    "Notification", "SubagentStart", "SubagentStop", "TaskCreated", "TaskCompleted", "PreCompact", "PostCompact",
    "Stop", "StopFailure",
  ].map((event) => [event, [{ matcher: "*", hooks: [{ type: "command", command, timeout: 1 }] }]]));
  writeFileSync(settings, JSON.stringify({ hooks: { ...hooks,
    PermissionRequest: [{ matcher: "*", hooks: [{
      type: "http", url: `http://127.0.0.1:${port}/hooks/permission`, timeout: 125,
    }] }],
  } }), { mode: 0o600 });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const sessions = new Map<string, Session>();
  const kills = new Set<ReturnType<typeof setTimeout>>();
  const groups = new Set<number>();
  const children = new Set<number>();
  let disposed = false;

  function killPid(pid: number, signal: NodeJS.Signals): void {
    try { process.kill(pid, signal); } catch { /* Already exited. */ }
  }

  function killGroup(pid: number, signal: NodeJS.Signals): void {
    try { process.kill(-pid, signal); } catch { /* Already exited. */ }
  }

  async function create(input: unknown): Promise<TerminalSession> {
    const { preset, cwd = process.env.AGENT_CHARACTER_CWD || process.env.INIT_CWD || process.cwd() } = sessionInput(input);
    if (!isAbsolute(cwd)) throw new Error("cwd must be an absolute directory path");
    try {
      if (!statSync(cwd).isDirectory()) throw new Error();
    } catch { throw new Error("cwd must be an existing directory"); }
    const program = preset === "shell" ? process.env.SHELL || "/bin/sh" : preset;
    const path = executable(program);
    if (!path) throw new Error(`${program} が PATH に見つかりません。インストールして server を再起動してください`);
    const project = await projectName(cwd);
    // Check after the await too: concurrent requests must not exceed the limit.
    if (disposed) throw new Error("Server is stopping");
    if (sessions.size >= SESSION_LIMIT) throw new Error("Session limit reached (16)");
    const id = randomBytes(6).toString("hex");
    const args = preset === "claude" ? ["--settings", settings]
      : preset === "pi" ? ["-e", join(root, "adapters/pi/agent-character.ts")] : [];
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
    for (const name of serverOnlyEnvironment) delete env[name];
    env.AGENT_CHARACTER_URL = `http://127.0.0.1:${port}/event`;
    env.AGENT_CHARACTER_SESSION = id;
    const terminal = spawn(path, args, { name: "xterm-256color", cols: 80, rows: 24, cwd, env });
    groups.add(terminal.pid);
    let stopped = false;
    const stop = (): void => {
      if (stopped) return;
      stopped = true;
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
    const session: Session = {
      info: { id, preset, cwd, project, createdAt: Date.now() }, terminal,
      output: Buffer.alloc(0), clients: new Set(), stop,
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
    });
    try { registerTown(session.info); }
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
        if (message?.type === "input" && typeof message.data === "string") session.terminal.write(message.data);
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
    sockets, handleRequest,
    getSession: (id: string) => sessions.get(id)?.info,
    activeProjects: () => new Set([...sessions.values()]
      .filter((session) => !session.info.exited).map((session) => session.info.project)),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const session of sessions.values()) session.stop();
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
