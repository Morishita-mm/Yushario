import { randomUUID, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { Candidate } from "../core/decider";
import { parseAgentEvent, type AgentEvent } from "../core/events";
import { MockDecider } from "../core/mock-decider";
import { selectCandidate } from "../core/selector";
import { JevDecider } from "./jev-decider";
import { serveStatic } from "./static";
import { createPtyServer } from "./pty";
import { PermissionWaiter, permissionOutput, permissionSummary } from "./permissions";

const permissions = new PermissionWaiter();
function broadcast(message: object): void {
  const json = JSON.stringify(message);
  for (const client of sockets.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(json);
  }
}

const port = Number(process.env.PORT ?? 8790);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}
const development = process.env.NODE_ENV === "development";
const token = development && process.env.AGENT_CHARACTER_TOKEN
  ? process.env.AGENT_CHARACTER_TOKEN : randomBytes(32).toString("hex");
const decider = process.env.TYPESAFE_API_KEY
  ? new JevDecider(process.env.TYPESAFE_API_KEY, process.env.JEV_MODEL ?? "jev-latest") : new MockDecider();
const recent: AgentEvent[] = [];
let previous: Candidate | undefined;
let lastDecisionMs = performance.now();
let latestEvent = 0;

function localOrigin(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

const server = createServer(async (request, response) => {
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

  let input: unknown;
  try {
    request.setEncoding("utf8");
    let body = "";
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 1_048_576) { response.writeHead(413).end(); return; }
    }
    input = JSON.parse(body);
  } catch {
    response.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Invalid JSON body" }));
    return;
  }
  if (request.url === "/hooks/permission") {
    const summary = permissionSummary(input);
    if (!summary) { response.writeHead(400).end(); return; }
    const permission = { type: "permission" as const, id: randomUUID(), ...summary };
    const connected = [...sockets.clients].some((client) => client.readyState === WebSocket.OPEN);
    const waiting = permissions.wait(permission, connected);
    if (connected) broadcast(permission);
    const disconnected = (): void => { permissions.decide(permission.id, "terminal"); };
    response.once("close", disconnected);
    const decision = await waiting;
    response.off("close", disconnected);
    broadcast({ type: "permission-resolved", id: permission.id });
    if (!response.destroyed) response.writeHead(200, { "Content-Type": "application/json" })
      .end(JSON.stringify(permissionOutput(decision)));
    return;
  }
  const result = parseAgentEvent(input);
  if (!result.ok) {
    response.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: result.error }));
    return;
  }

  permissions.observe(result.event);
  if (process.env.AGENT_CHARACTER_DEBUG === "1") {
    const { state, source, tool, ts, context } = result.event;
    console.log(JSON.stringify({ state, source, tool, ts, context }));
  }
  response.writeHead(204).end();
  const sequence = ++latestEvent;
  const now = performance.now();
  recent.push(result.event);
  if (recent.length > 10) recent.shift();
  const context = { event: result.event, recent: [...recent], previous, elapsedMs: now - lastDecisionMs };
  // Let the hook response flush before starting potentially slow remote inference.
  setImmediate(async () => {
    try {
      const candidates = await decider.decide(context);
      // Preserve the web's former latest-event-wins behavior, without a queue.
      if (sequence === latestEvent) {
        previous = selectCandidate(candidates, Math.random);
        lastDecisionMs = now;
        const message = JSON.stringify({ type: "decision", event: result.event, candidate: previous });
        for (const client of sockets.clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(message, (error) => {
              if (error) console.error("WebSocket send failed:", error.message);
            });
          }
        }
      }
    } catch (error) {
      console.error("Decision failed:", error instanceof Error ? error.message : String(error));
    }
  });
});

const sockets = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
const pty = createPtyServer(port);
server.on("upgrade", (request, socket, head) => {
  let url: URL;
  try {
    url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  } catch {
    socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    return;
  }
  const origin = request.headers.origin;
  const ownOrigin = origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
  if (!["/ws", "/pty"].includes(url.pathname) || url.searchParams.get("token") !== token
    || !origin || !(ownOrigin || (development && localOrigin(origin)))) {
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
  if (permissions.current) client.send(JSON.stringify(permissions.current));
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
});
function shutdown(): void {
  permissions.cancel();
  pty.dispose();
  for (const client of sockets.clients) client.terminate();
  sockets.close();
  server.close(() => process.exit());
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
process.once("exit", () => pty.dispose());

server.listen(port, "127.0.0.1", () => {
  console.log(`Decider: ${decider.constructor.name}`);
  console.log(`Open http://127.0.0.1:${port}/?token=${token}`);
});
