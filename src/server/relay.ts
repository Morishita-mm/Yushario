import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { parseAgentEvent } from "../core/events";

const port = Number(process.env.PORT ?? 8790);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (request.url !== "/event") {
    response.writeHead(404).end();
    return;
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
    for await (const chunk of request) body += chunk;
    input = JSON.parse(body);
  } catch {
    response.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Invalid JSON body" }));
    return;
  }
  const result = parseAgentEvent(input);
  if (!result.ok) {
    response.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: result.error }));
    return;
  }

  const message = JSON.stringify(result.event);
  for (const client of sockets.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message, (error) => {
        if (error) console.error("WebSocket send failed:", error.message);
      });
    }
  }
  response.writeHead(204).end();
});

const sockets = new WebSocketServer({ server, path: "/ws" });
sockets.on("error", (error) => {
  console.error("WebSocket server error:", error.message);
  process.exitCode = 1;
});
sockets.on("connection", (client) => {
  client.on("error", (error) => console.error("WebSocket error:", error.message));
});
server.on("error", (error) => {
  console.error("Relay error:", error.message);
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => {
  console.log(`Relay listening on http://localhost:${port} (WS /ws)`);
});
