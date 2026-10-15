import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import type { AgentEvent } from "../core/events";
import { receiveHook } from "./relay-hooks";
import { EVENT_HISTORY_LIMIT, historyDiscardIndex, type RecordedEvent } from "../core/event-history";
import { DAY_MS } from "../core/town-ledger";
import { namedHero } from "../core/names";
import { TownLedger } from "./town-api";
import { QuestLedger } from "./quest-ledger";
import { handleQuestRequest } from "./quest-api";
import { QuestParty } from "./party";
import { handlePartyRequest } from "./party-api";
import { handleAgentQuest } from "./party-agent-api";
import { handleChecksRequest } from "./checks-api";
import { observeChecks, refreshCheckFingerprint } from "./checks";
import { certainCheckCommand, ranAtBase } from "../core/checks";
import { serveStatic } from "./static";
import { handleReview } from "./review";
import { handleWorktrees } from "./worktrees";
import { handlePreview } from "./preview";
import { createPtyServer } from "./pty";
import { AGENTS } from "./agents";
import { PermissionWaiter } from "./permissions";
import { allowedHost } from "../core/local-request";
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
const ledger = new TownLedger((towns) => broadcast({ type: "towns", towns }),
  (names) => broadcast({ type: "names", names }));
const quests = new QuestLedger((message) => { broadcast(message); party.prune(new Set(message.quests.map((quest) => quest.id))); }, () => ledger.saveConversation);

function record(event: AgentEvent): boolean {
  const { command, uncertain: _claimed, ...observed } = event;
  const session = event.terminal ? pty.getSession(event.terminal) : undefined;
  // The full command is not replayed; keep only whether its shape or folder hides a test result.
  event = command !== undefined && (!certainCheckCommand(command) || session && !ranAtBase(event.name, session.cwd)) ? { ...observed, uncertain: true } : observed;
  if (event.terminal && event.hook !== "SessionEnd" && !pty.agentSession(event.terminal)?.active) return false;
  // Hooks run concurrently, so order by the hook's own clock when it is plausible.
  const now = Date.now();
  const at = event.ts !== undefined && Math.abs(event.ts - now) < 60_000 ? event.ts : now;
  if (session) {
    event = { ...event, project: session.project, branch: session.branch ?? "" };
    try { if (quests.observe(session, event, at, (id) => !pty.getSession(id) || Boolean(pty.getSession(id)?.exited)) === false) return false; } catch (error) { console.error("Quest save failed:", error); }
  }
  if (session && AGENTS[session.preset].hero) {
    try { ledger.observe(session.project, now); }
    catch (error) { console.error("Town activity save failed:", error); }
  }
  history.push({ event, at });
  if (history.length > EVENT_HISTORY_LIMIT) history.splice(historyDiscardIndex(history), 1);
  broadcast({ type: "event", event, at });
  if (session) pty.observe(event, at);
  if (session) try { party.observe(session, event, at); } catch (error) { console.error("Party save failed:", error); }
  if (session) try { observeChecks(quests, session, { ...event, command }, at, pty.listSessions()); } catch (error) { console.error("Check save failed:", error); }
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

async function dispatchHttp(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (!allowedHost(request.headers.host, port)) { response.writeHead(403).end(); return; }
  let url: URL;
  try { url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`); }
  catch { response.writeHead(400).end(); return; }
  if (url.pathname === "/api/agent/quests" || url.pathname.startsWith("/api/agent/quests/")) {
    if (request.headers.origin !== undefined) { response.writeHead(403).end(); return; }
    await handleAgentQuest(request, response, url, party); return;
  }
  const sessionApi = url.pathname === "/api/equipment" || url.pathname === "/api/agents" || url.pathname === "/api/sessions" || url.pathname.startsWith("/api/sessions/")
    || url.pathname === "/api/roster" || url.pathname.startsWith("/api/roster/");
  const townApi = url.pathname === "/api/towns" || url.pathname.startsWith("/api/towns/")
    || url.pathname === "/api/settings" || url.pathname === "/api/names" || url.pathname.startsWith("/api/names/");
  const questApi = url.pathname === "/api/quests" || url.pathname.startsWith("/api/quests/");
  const reviewApi = url.pathname === "/api/review" || url.pathname === "/api/review/diff" || url.pathname === "/api/review/verdict";
  const worktreeApi = url.pathname === "/api/worktrees";
  const previewApi = url.pathname === "/api/previews";
  const partyApi = url.pathname === "/api/party-notices" || url.pathname.startsWith("/api/party-notices/") || /^\/api\/quests\/[^/]+\/(party|scroll|send|summary|handoff)$/.test(url.pathname);
  if (sessionApi || townApi || questApi || reviewApi || worktreeApi || previewApi || partyApi) {
    if (!authorized(url, request.headers.origin, false)) { response.writeHead(403).end(); return; }
    if (partyApi) await handlePartyRequest(request, response, url, party);
    else if (previewApi) await handlePreview(request, response, url, port, quests, ledger.towns, pty.listSessions());
    else if (worktreeApi) await handleWorktrees(request, response, url, pty.listSessions, (path) => quests.foldedWorktree(path));
    else if (reviewApi) await handleReview(request, response, url, pty.getSession(url.searchParams.get("session") ?? ""),
      url.searchParams.has("quest") ? quests.get(url.searchParams.get("quest") ?? "") : undefined, () => reviewed(url),
      (result, decision) => quests.verdict(url.searchParams.get("session") ?? "", url.searchParams.get("quest") ?? undefined, result, decision));
    else if (questApi) {
      if (!await handleChecksRequest(request, response, url, quests, pty.listSessions)) await handleQuestRequest(request, response, url, quests, ledger.towns, pty.getSession);
    }
    else if (sessionApi) await pty.handleRequest(request, response, url);
    else await ledger.handleRequest(request, response, url);
    return;
  }
  if (request.url !== "/event" && request.url !== "/hooks/permission") {
    await serveStatic(request, response);
    return;
  }
  await receiveHook(request, response, pty, quests, permissions, sockets, record, broadcast);
}

function reviewed(url: URL): void {
  try {
    const session = pty.getSession(url.searchParams.get("session") ?? ""), questId = url.searchParams.get("quest") ?? (session && quests.current(session.id)?.id);
    if (questId) void refreshCheckFingerprint(quests, questId, pty.listSessions()).catch(() => undefined);
    quests.reviewed(url.searchParams.get("session") ?? "", Date.now(), questId);
  } catch (error) { console.error("Quest review save failed:", error); }
}

const server = createServer(dispatchHttp);
port = await listenAvailable(server, options.port);
const sockets = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
const pty = createPtyServer(port, (session) => ledger.register(session.projectName ?? session.project, session.cwd, session.createdAt, session.project, session.projectParent), broadcast,
  record, (terminal) => { quests.forgetSession(terminal); party.forgetSession(terminal); broadcast(party.snapshot()); }, (id) => namedHero(ledger.names, id), broadcast, broadcast,
  (session, text, hero) => quests.requested(session, text, Date.now(), hero));
const party = new QuestParty(quests, pty, broadcast, record, (id) => namedHero(ledger.names, id));
function archive(): void {
  try { ledger.archive(pty.activeTownKeys(), Date.now()); }
  catch (error) { console.error("Town archive failed:", error); }
}
archive();
const archiveTimer = setInterval(archive, DAY_MS).unref();
const activityTimer = setInterval(flushActivity, 5000).unref();
function flushActivity(): void {
  try { ledger.flushActivity(); }
  catch (error) { console.error("Town activity save failed:", error); }
}
function upgradeSocket(request: IncomingMessage, socket: Duplex, head: Buffer): void {
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
}
server.on("upgrade", upgradeSocket);
sockets.on("error", (error) => {
  console.error("WebSocket server error:", error.message);
  process.exitCode = 1;
});
function connectSocket(client: WebSocket): void {
  client.on("error", (error) => console.error("WebSocket error:", error.message));
  client.send(JSON.stringify({ type: "replay", events: history }));
  client.send(JSON.stringify({ type: "towns", towns: ledger.towns }));
  client.send(JSON.stringify({ type: "names", names: ledger.names }));
  client.send(JSON.stringify(quests.snapshot()));
  client.send(JSON.stringify(party.snapshot()));
  for (const message of pty.pending()) client.send(JSON.stringify(message));
  // These are snapshots too, not fresh requests that should ring on reconnect.
  for (const message of pty.attention()) client.send(JSON.stringify({ ...message, live: false }));
  for (const permission of permissions.pending) client.send(JSON.stringify({ ...permission, live: false }));
  client.on("message", receiveDecision);
  client.once("close", () => {
    if (![...sockets.clients].some((socket) => socket.readyState === WebSocket.OPEN)) permissions.cancel();
  });
}
function receiveDecision(data: RawData, binary: boolean): void {
  if (binary) return;
  try {
    const message = JSON.parse(String(data));
    if (message?.type === "permission-decision") permissions.decide(message.id, message.decision);
  } catch { /* Ignore malformed or stale decisions. */ }
}
sockets.on("connection", connectSocket);
server.on("error", (error) => {
  console.error("Relay error:", error.message);
  process.exitCode = 1;
  shutdown();
});
function shutdown(): void {
  clearInterval(archiveTimer);
  clearInterval(activityTimer);
  flushActivity();
  permissions.cancel();
  pty.dispose();
  quests.close();
  for (const client of sockets.clients) client.terminate();
  sockets.close();
  server.close(() => process.exit());
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
process.once("exit", () => pty.dispose());

function announceStartup(): void {
  const url = `http://127.0.0.1:${port}/?token=${token}`;
  if (port !== options.port) console.log(`Port ${options.port} is in use; using ${port}.`);
  printStartupLogo();
  console.log(`Open ${url}`);
  console.log(`Terminal: http://127.0.0.1:${port}/terminal.html?token=${token}`);
  if (options.open) openBrowser(url);
}
announceStartup();
