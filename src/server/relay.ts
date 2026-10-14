import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { parseAgentEvent, type AgentEvent } from "../core/events";
import { EVENT_HISTORY_LIMIT, historyDiscardIndex, type RecordedEvent } from "../core/event-history";
import { DAY_MS } from "../core/town-ledger";
import { namedHero } from "../core/names";
import { TownLedger } from "./town-api";
import { serveStatic } from "./static";
import { createPtyServer } from "./pty";
import { AGENTS } from "./agents";
import { PermissionWaiter, PERMISSION_TIMEOUT_MS, permissionOutput, permissionSummary } from "./permissions";
import { allowedHost } from "../core/local-request";
import { EVENT_BODY_LIMIT, readJsonBody } from "./http-body";
import { listenAvailable, openBrowser, prepareDataDirectory, startupOptions } from "./startup";
import { printStartupLogo } from "./startup-logo";

const permissions = new PermissionWaiter();
function broadcast(message: object): void {
  const json = JSON.stringify(message);
  for (const client of sockets.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(json);
  }
}

const options = startupOptions(process.argv.slice(2));
// The bin preflights this before loading PTY; direct development startup also needs it.
prepareDataDirectory();
let port = options.port;
const development = process.env.NODE_ENV === "development";
const token = development && process.env.AGENT_CHARACTER_TOKEN
  ? process.env.AGENT_CHARACTER_TOKEN : randomBytes(32).toString("hex");
// Recent events let a newly opened room rebuild who is present and what they are doing.
const history: RecordedEvent[] = [];
// A resumed conversation has a new terminal; never replay late hooks from its old one.
const endedTerminals = new Set<string>();
const ledger = new TownLedger((towns) => broadcast({ type: "towns", towns }),
  (names) => broadcast({ type: "names", names }));

function record(event: AgentEvent): boolean {
  if (event.terminal && endedTerminals.has(event.terminal)) return false;
  if (event.terminal && event.hook === "SessionEnd" && !event.subagent) endedTerminals.add(event.terminal);
  // Hooks run concurrently, so order by the hook's own clock when it is plausible.
  const now = Date.now();
  const at = event.ts !== undefined && Math.abs(event.ts - now) < 60_000 ? event.ts : now;
  const session = event.terminal ? pty.getSession(event.terminal) : undefined;
  if (session && AGENTS[session.preset].hero) {
    try { ledger.observe(session.project, now); }
    catch (error) { console.error("Town activity save failed:", error); }
  }
  history.push({ event, at });
  if (history.length > EVENT_HISTORY_LIMIT) history.splice(historyDiscardIndex(history), 1);
  broadcast({ type: "event", event, at });
  pty.observe(event, at);
  return true;
}

function localOrigin(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function authorized(url: URL, origin: string | undefined, requireOrigin: boolean): boolean {
  const ownOrigin = origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
  return url.searchParams.get("token") === token
    && (origin === undefined ? !requireOrigin : ownOrigin || (development && localOrigin(origin)));
}

const server = createServer(async (request, response) => {
  if (!allowedHost(request.headers.host, port)) { response.writeHead(403).end(); return; }
  let url: URL;
  try { url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`); }
  catch { response.writeHead(400).end(); return; }
  const sessionApi = url.pathname === "/api/equipment" || url.pathname === "/api/agents" || url.pathname === "/api/sessions" || url.pathname.startsWith("/api/sessions/")
    || url.pathname === "/api/roster" || url.pathname.startsWith("/api/roster/");
  const townApi = url.pathname === "/api/towns" || url.pathname.startsWith("/api/towns/")
    || url.pathname === "/api/settings" || url.pathname === "/api/names" || url.pathname.startsWith("/api/names/");
  if (sessionApi || townApi) {
    if (!authorized(url, request.headers.origin, false)) { response.writeHead(403).end(); return; }
    if (sessionApi) await pty.handleRequest(request, response, url);
    else await ledger.handleRequest(request, response, url);
    return;
  }
  if (request.url !== "/event" && request.url !== "/hooks/permission") {
    await serveStatic(request, response);
    return;
  }
  const origin = request.headers.origin;
  if (origin !== undefined && !localOrigin(origin)) {
    response.writeHead(403).end();
    return;
  }
  if (origin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }
  if (request.method !== "POST") {
    response.writeHead(405, { Allow: "POST, OPTIONS" }).end();
    return;
  }

  const body = await readJsonBody(request, response, EVENT_BODY_LIMIT);
  if (!body.ok) return;
  const input = body.value;
  if (request.url === "/hooks/permission") {
    const summary = permissionSummary(input);
    if (!summary) { response.writeHead(400).end(); return; }
    const permission = { type: "permission" as const, id: randomUUID(), expiresAt: Date.now() + PERMISSION_TIMEOUT_MS, ...summary };
    record({ state: "waiting_input", source: "claude-code", hook: "PermissionRequest", tool: summary.tool, detail: summary.summary.slice(0, 200),
      ...(summary.agent ? { agent: summary.agent } : {}), ...(summary.name ? { name: summary.name } : {}),
      ...(summary.helper ? { subagent: { id: summary.helper } } : {}) });
    const connected = [...sockets.clients].some((client) => client.readyState === WebSocket.OPEN);
    const waiting = permissions.wait(permission, connected);
    if (permissions.pending.some((item) => item.id === permission.id)) broadcast(permission);
    const disconnected = (): void => { permissions.decide(permission.id, "terminal"); };
    response.once("close", disconnected);
    const decision = await waiting;
    response.off("close", disconnected);
    broadcast({ type: "permission-resolved", id: permission.id });
    if (decision !== "terminal" && summary.agent && !permissions.pending.some((item) => item.agent === summary.agent)) pty.answered(summary.agent);
    if (!response.destroyed) response.writeHead(200, { "Content-Type": "application/json" })
      .end(JSON.stringify(permissionOutput(decision)));
    return;
  }
  const result = parseAgentEvent(input);
  if (!result.ok) {
    response.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: result.error }));
    return;
  }

  response.writeHead(204).end();
  if (!record(result.event)) return;
  permissions.observe(result.event);
  if (process.env.AGENT_CHARACTER_DEBUG === "1") {
    const { state, source, tool, ts, context, hook, agent, target, terminal, project } = result.event;
    console.log(JSON.stringify({ state, source, tool, ts, context, hook, agent, target, terminal, project }));
  }
});

port = await listenAvailable(server, options.port);
const sockets = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
const pty = createPtyServer(port, (session) => ledger.register(session.project, session.cwd, session.createdAt), broadcast,
  record, (terminal) => { endedTerminals.add(terminal); }, (id) => namedHero(ledger.names, id), broadcast, broadcast);
function archive(): void {
  try { ledger.archive(pty.activeProjects(), Date.now()); }
  catch (error) { console.error("Town archive failed:", error); }
}
archive();
const archiveTimer = setInterval(archive, DAY_MS).unref();
const activityTimer = setInterval(() => {
  try { ledger.flushActivity(); }
  catch (error) { console.error("Town activity save failed:", error); }
}, 5000).unref();
server.on("upgrade", (request, socket, head) => {
  if (!allowedHost(request.headers.host, port)) {
    socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    return;
  }
  let url: URL;
  try {
    url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  } catch {
    socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    return;
  }
  if (!["/ws", "/pty"].includes(url.pathname) || !authorized(url, request.headers.origin, true)) {
    socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    return;
  }
  const target = url.pathname === "/pty" ? pty.sockets : sockets;
  target.handleUpgrade(request, socket, head, (client) => target.emit("connection", client, request));
});
sockets.on("error", (error) => {
  console.error("WebSocket server error:", error.message);
  process.exitCode = 1;
});
sockets.on("connection", (client) => {
  client.on("error", (error) => console.error("WebSocket error:", error.message));
  client.send(JSON.stringify({ type: "replay", events: history }));
  client.send(JSON.stringify({ type: "towns", towns: ledger.towns }));
  client.send(JSON.stringify({ type: "names", names: ledger.names }));
  for (const message of pty.pending()) client.send(JSON.stringify(message));
  // These are snapshots too, not fresh requests that should ring on reconnect.
  for (const message of pty.attention()) client.send(JSON.stringify({ ...message, live: false }));
  for (const permission of permissions.pending) client.send(JSON.stringify({ ...permission, live: false }));
  client.on("message", (data, binary) => {
    if (binary) return;
    try {
      const message = JSON.parse(String(data));
      if (message?.type === "permission-decision") permissions.decide(message.id, message.decision);
    } catch { /* Ignore malformed or stale decisions. */ }
  });
  client.once("close", () => {
    if (![...sockets.clients].some((socket) => socket.readyState === WebSocket.OPEN)) permissions.cancel();
  });
});
server.on("error", (error) => {
  console.error("Relay error:", error.message);
  process.exitCode = 1;
  shutdown();
});
function shutdown(): void {
  clearInterval(archiveTimer);
  clearInterval(activityTimer);
  try { ledger.flushActivity(); }
  catch (error) { console.error("Town activity save failed:", error); }
  permissions.cancel();
  pty.dispose();
  for (const client of sockets.clients) client.terminate();
  sockets.close();
  server.close(() => process.exit());
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
process.once("exit", () => pty.dispose());

const url = `http://127.0.0.1:${port}/?token=${token}`;
if (port !== options.port) console.log(`Port ${options.port} is in use; using ${port}.`);
printStartupLogo();
console.log(`Open ${url}`);
console.log(`Terminal: http://127.0.0.1:${port}/terminal.html?token=${token}`);
if (options.open) openBrowser(url);
