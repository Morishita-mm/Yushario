import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { WebSocket, type WebSocketServer } from "ws";
import { parseAgentEvent, type AgentEvent } from "../core/events";
import { canRecallHero, hookEventForTerminal } from "../core/hook-trust";
import { EVENT_BODY_LIMIT, readJsonBody } from "./http-body";
import { PermissionWaiter, PERMISSION_TIMEOUT_MS, permissionOutput, permissionSummary } from "./permissions";
import type { createPtyServer } from "./pty";
import type { QuestLedger } from "./quest-ledger";
import { permissionChange } from "../core/permission-change";
import { mobileText } from "../core/mobile-protocol";

type PtyServer = ReturnType<typeof createPtyServer>;

export async function receiveHook(request: IncomingMessage, response: ServerResponse, pty: PtyServer,
  quests: QuestLedger, permissions: PermissionWaiter, sockets: WebSocketServer,
  record: (event: AgentEvent) => boolean, broadcast: (message: object) => void, mobileConnected = false): Promise<void> {
  if (request.headers.origin !== undefined) { response.writeHead(403).end(); return; }
  if (request.method !== "POST") { response.writeHead(405, { Allow: "POST" }).end(); return; }
  const body = await readJsonBody(request, response, EVENT_BODY_LIMIT);
  if (!body.ok) return;
  let sender = pty.hookSession(request.headers.authorization);
  if (request.url === "/hooks/permission") {
    await receivePermission(body.value, response, sender, pty, quests, permissions, sockets, record, broadcast, mobileConnected);
    return;
  }
  const result = parseAgentEvent(body.value);
  if (!result.ok) {
    response.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: result.error }));
    return;
  }
  // A valid credential cannot claim a different terminal's existing hero either.
  const owner = result.event.agent && (quests.sessionForHero(result.event.agent) ?? pty.sessionForAgent(result.event.agent)?.id);
  if (sender && owner && owner !== sender.id && !canRecallHero(sender.recalledHero, result.event.agent, !pty.getSession(owner) || Boolean(pty.getSession(owner)?.exited))) sender = undefined;
  const event = hookEventForTerminal(result.event, sender?.id);
  const recorded = record(event);
  response.writeHead(!recorded && !sender ? 429 : 204).end();
  if (!recorded) return;
  if (sender) permissions.observe(event);
  // Git must never delay hook ordering; the refreshed badge is used by the next event/list.
  if (event.terminal && !event.subagent && ["SessionStart", "UserPromptSubmit", "Stop", "StopFailure"].includes(event.hook ?? "")) void pty.refreshBranch(event.terminal);
  if (process.env.AGENT_CHARACTER_DEBUG === "1") {
    const { state, source, tool, ts, context, hook, agent, target, terminal, project } = event;
    console.log(JSON.stringify({ state, source, tool, ts, context, hook, agent, target, terminal, project }));
  }
}

async function receivePermission(input: unknown, response: ServerResponse, sender: ReturnType<PtyServer["hookSession"]>,
  pty: PtyServer, quests: QuestLedger, permissions: PermissionWaiter, sockets: WebSocketServer,
  record: (event: AgentEvent) => boolean, broadcast: (message: object) => void, mobileConnected: boolean): Promise<void> {
  const summary = permissionSummary(input);
  if (!summary) { response.writeHead(400).end(); return; }
  const event = hookEventForTerminal({ state: "waiting_input", source: "claude-code", hook: "PermissionRequest", tool: summary.tool, detail: summary.summary.slice(0, 200),
    agent: sender?.hero ?? summary.agent, ...(summary.name ? { name: summary.name } : {}),
    ...(summary.helper ? { subagent: { id: summary.helper } } : {}) }, sender?.id);
  record(event);
  if (!sender) { response.writeHead(200, { "Content-Type": "application/json" }).end("{}"); return; }
  const permission = { type: "permission" as const, id: randomUUID(), expiresAt: Date.now() + PERMISSION_TIMEOUT_MS, ...summary, agent: event.agent, terminal: sender.id };
  const connected = mobileConnected || [...sockets.clients].some((client) => client.readyState === WebSocket.OPEN);
  // Freeze context at hook receipt, using the authenticated terminal, never hook cwd/branch/session_id.
  const quest = quests.current(sender.id), member = quests.member(sender.id);
  const work = quest && quest.town === sender.project && !["done", "dropped"].includes(quest.state)
    && (!member?.hero || member.hero === sender.hero) && mobileText(quest.id, 200) && mobileText(quest.title, 200)
    ? { questId: quest.id, title: quest.title } : null;
  const waiting = permissions.wait(permission, connected, { work, change: permissionChange(input, permission.content.length) });
  if (permissions.pending.some((item) => item.id === permission.id)) broadcast(permission);
  const disconnected = (): void => { permissions.decide(permission.id, "terminal"); };
  response.once("close", disconnected);
  const decision = await waiting;
  response.off("close", disconnected);
  broadcast({ type: "permission-resolved", id: permission.id });
  if (decision !== "terminal" && !permissions.pending.some((item) => item.terminal === permission.terminal)) {
    pty.answered(permission.terminal); quests.answered(permission.terminal);
  }
  if (!response.destroyed) response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(permissionOutput(decision)));
}
