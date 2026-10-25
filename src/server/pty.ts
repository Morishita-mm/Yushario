import { serverLanguage, tr } from "./language";
import { randomBytes } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import type { AgentEvent } from "../core/events";
import { equipmentInput } from "../core/equipment";
import { WebSocketServer } from "ws";
import { SESSION_LIMIT, TerminalLimitError, initialText, sessionInput, type EquippedMessage, type PendingMessage, type Preset, type Session, type TerminalSession } from "./pty-session";
import { connectTerminal, relayOutput } from "./pty-socket";
import { worktreeBranch, worktreeRemoving } from "./worktrees";
import { clearPending, clearTexts, observe as observeSession, pending, say } from "./pty-actions";
import { flushEquipment } from "./pty-equipment";
import { handlePtyAction } from "./pty-api-actions";
import { addRosterEntry, isClaudeSessionId } from "../core/roster";
import { readEquipment, readRoster, writeRoster } from "./town-data";
import { projectIdentity } from "./project";
import { launchPty, MOBILE_LAUNCH_ARGS, writeClaudeSettings } from "./pty-launch";
import { AGENTS, publicAgents } from "./agents";
import { replacedSession } from "../core/session-actions";
import { descendants } from "./pty-process";
import { authenticatedHookSession } from "./hook-auth";
import { readJsonBody, ACTION_BODY_LIMIT } from "./http-body";
import { requirePartyConversation, TerminalOnlyError, type QuestParty } from "./party";

// mobile: only Claude/Codex with forced approval flags. beforeLaunch runs after every check, just before spawn.
export type PtyLaunchOptions = { mobile?: true; beforeLaunch?: (info: { id: string; preset: Preset; cwd: string; project: string }) => void };
export type PtyManager = ReturnType<typeof createPtyServer>;

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" })
    .end(JSON.stringify(value));
}

export function createPtyServer(port: number, registerTown: (session: TerminalSession) => void,
  pendingChanged: (message: PendingMessage) => void, recordEvent: (event: AgentEvent) => void,
  terminalEnded: (terminal: string) => void, chosenName: (id: string) => string | undefined,
  attentionChanged: (message: { type: "attention"; terminal: string; reason: "trust" }) => void,
  equipmentChanged: (message: EquippedMessage) => void,
  requested?: (session: TerminalSession, text: string, hero?: string) => void) {
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
    if (!event.subagent && event.agent) session.info.hero = event.agent;
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

  async function create(input: unknown, resume?: string, launch: PtyLaunchOptions = {}): Promise<TerminalSession> {
    const { preset, cwd: inputCwd = process.env.AGENT_CHARACTER_CWD || process.env.INIT_CWD || process.cwd() } = sessionInput(input);
    const text = initialText(input);
    if (text !== undefined) requirePartyConversation(preset);
    if (launch.mobile && (!MOBILE_LAUNCH_ARGS[preset] || resume !== undefined)) throw new Error(tr("スマホからは この勇者を 起動できない。", "This hero cannot be launched from a phone"));
    let cwd = inputCwd;
    if (!isAbsolute(cwd)) throw new Error(tr("行き先は フォルダの絶対パスで。", "Use an absolute folder path"));
    try {
      if (!statSync(cwd).isDirectory()) throw new Error();
      cwd = realpathSync(cwd);
    } catch { throw new Error(tr("行き先のフォルダが 見つからない。存在するフォルダを選ぼう。", "Destination folder not found. Choose an existing folder")); }
    const selectedEquipment = equipmentInput(input, equipment[preset], serverLanguage());
    const identity = await projectIdentity(cwd);
    const townKey = identity.key;
    const branch = await worktreeBranch(cwd);
    if (worktreeRemoving(cwd)) throw new Error(tr("この 拠点は たたんでいる", "This base is folding"));
    // Check after the await too: concurrent requests must not exceed the limit.
    if (disposed) throw new Error(tr("サーバーは 停止処理中。", "Server is stopping"));
    if (sessions.size >= SESSION_LIMIT) throw new TerminalLimitError();
    const id = randomBytes(6).toString("hex");
    const agentToken = randomBytes(32).toString("hex");
    launch.beforeLaunch?.({ id, preset, cwd, project: townKey });
    const terminal = launchPty(preset, cwd, id, port, settings, selectedEquipment, equipment[preset], identity.name, resume, agentToken, launch.mobile === true, text);
    groups.add(terminal.pid);
    let stopped = false;
    function stop(): void {
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
    }
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => { finish = resolve; });
    const session: Session = {
      info: { id, preset, cwd, project: townKey, branch, projectName: identity.name, projectParent: identity.parent, createdAt: Date.now(), ...(resume ? { recalledHero: resume } : {}), ...selectedEquipment }, terminal,
      agentToken, output: Buffer.alloc(0), modes: new Map(), clients: new Set(), stop, waiting: false, eventAt: -Infinity, texts: [],
      interrupted: false, interrupting: false, departing: false, asking: false, askedAt: -Infinity, agentId: resume,
      hasMainHook: false, hasPrompt: Boolean(resume), name: basename(cwd), finished, finish,
    };
    sessions.set(id, session);
    const output = (data: string): void => relayOutput(session, data, port, attentionChanged);
    terminal.onData(output);
    function exited({ exitCode }: { exitCode: number }): void {
      session.info.exited = { code: exitCode, at: Date.now() };
      stop();
      output(tr(`\r\n[終了: ${exitCode}]\r\n`, `\r\n[Ended: ${exitCode}]\r\n`));
      for (const client of session.clients) client.close(1000, tr("終了した。", "Ended"));
      rememberDeparture(session);
      // Every town-capable agent departs even if its own shutdown event never arrived.
      if (AGENTS[preset].hero && session.agentId && !session.ended) recordEvent({ state: "idle", hook: "SessionEnd",
        agent: session.agentId, name: session.name, terminal: id, project: townKey, source: AGENTS[preset].source });
      terminalEnded(id);
      session.finish();
    }
    terminal.onExit(exited);
    try { if (AGENTS[preset].hero) registerTown(session.info); }
    catch { sessions.delete(id); stop(); throw new Error(tr("町の記録を 保存できない。データフォルダの権限を たしかめよう。", "Could not save towns. Check data-folder permissions")); }
    return session.info;
  }

  async function handleRequest(request: IncomingMessage, response: ServerResponse, url: URL, party: QuestParty): Promise<void> {
    if (url.pathname === "/api/equipment" && request.method === "GET") {
      json(response, 200, readEquipment(serverLanguage()));
    } else if (url.pathname === "/api/agents" && request.method === "GET") {
      json(response, 200, publicAgents());
    } else if (url.pathname === "/api/sessions" && request.method === "GET") {
      json(response, 200, [...sessions.values()].map((session) => session.info));
    } else if (url.pathname === "/api/sessions" && request.method === "POST") {
      const body = await readJsonBody(request, response, ACTION_BODY_LIMIT);
      if (!body.ok) return;
      try {
        const info = await party.create(body.value);
        json(response, 201, info);
      } catch (error) {
        const message = error instanceof SyntaxError ? tr("起動の設定は JSON で。", "Send launch settings as JSON") : error instanceof Error ? error.message : tr("起動できなかった。", "Could not launch");
        json(response, error instanceof TerminalLimitError || error instanceof TerminalOnlyError ? 409 : 400, { error: message });
      }
    } else if (url.pathname === "/api/roster" && request.method === "GET") {
      json(response, 200, roster);
    } else if (url.pathname.startsWith("/api/roster/") && url.pathname.endsWith("/recall") && request.method === "POST") {
      let sessionId: string;
      try { sessionId = decodeURIComponent(url.pathname.slice("/api/roster/".length, -"/recall".length)); }
      catch { json(response, 400, { error: tr("勇者の ID が正しくない。", "Invalid hero ID") }); return; }
      if (!isClaudeSessionId(sessionId)) { json(response, 400, { error: tr("勇者の ID が正しくない。", "Invalid hero ID") }); return; }
      const entry = roster.find((item) => item.sessionId === sessionId);
      if (!entry) { json(response, 404, { error: tr("めいぼに その勇者はいない。", "Hero not found in roster") }); return; }
      if (recalling.has(sessionId)) { json(response, 409, { error: tr("この勇者は よびもどし中。", "This hero is being recalled") }); return; }
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
          json(response, 500, { error: tr("めいぼを 保存できない。", "Could not save roster") }); return;
        }
        json(response, 201, info);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        json(response, error instanceof TerminalLimitError ? 409 : 400, { error: message });
      } finally { recalling.delete(sessionId); }
    } else if (/^\/api\/sessions\/[^/]+\/(say|action|equip)$/.test(url.pathname) && request.method === "POST") {
      const session = sessions.get(url.pathname.split("/")[3]);
      if (!session) { json(response, 404, { error: tr("そのターミナルが 見つからない。", "Terminal not found") }); return; }
      const departed = await handlePtyAction(request, response, url.pathname, session,
        equipment[session.info.preset], pendingChanged, equipmentChanged, recordEvent, requested);
      if (departed) sessions.delete(session.info.id);
    } else if (/^\/api\/sessions\/[^/]+\/pending$/.test(url.pathname) && request.method === "DELETE") {
      const session = sessions.get(url.pathname.split("/")[3]);
      if (!session) { json(response, 404, { error: tr("そのターミナルが 見つからない。", "Terminal not found") }); return; }
      party.quests.cancelPending(session.info.id);
      json(response, 200, { ok: true });
    } else if (url.pathname.startsWith("/api/sessions/") && request.method === "DELETE") {
      const id = url.pathname.slice("/api/sessions/".length);
      const session = sessions.get(id);
      if (!session) { json(response, 404, { error: tr("そのターミナルが 見つからない。", "Terminal not found") }); return; }
      sessions.delete(id);
      session.stop();
      for (const client of session.clients) client.close(1000, tr("ターミナルを 終了して消した", "Terminal ended and removed"));
      response.writeHead(204).end();
    } else {
      response.writeHead(405, { Allow: "GET, POST, DELETE" }).end();
    }
  }

  sockets.on("connection", (client, request) => connectTerminal(client, request, port, sessions));
  sockets.on("error", (error) => console.error("PTY server error:", error.message));
  function dispose(): void {
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
  }
  return {
    sockets, handleRequest, observe, dispose,
    // The app answered a permission prompt: the CLI no longer waits, so steering is safe again.
    answered: (terminal: string) => {
      const session = sessions.get(terminal); if (session) { session.asking = false; session.askedAt = Date.now(); }
    },
    hookSession: (authorization: string | undefined) => disposed ? undefined : authenticatedHookSession(authorization, sessions.values()),
    clearTexts: (id: string) => { const session = sessions.get(id); if (session) clearTexts(session, pendingChanged); },
    pending: () => [...sessions.values()].filter((session) => session.texts.length || session.pendingEquipment).map(pending),
    attention: () => [...sessions.values()].filter((session) => session.attention && !session.agentId && !session.info.exited)
      .map((session) => ({ type: "attention", terminal: session.info.id, reason: "trust" })),
    create,
    end: (id: string) => { sessions.get(id)?.stop(); sessions.delete(id); },
    agentSession: (id: string) => { const session = sessions.get(id); return session && { token: session.agentToken, waiting: session.waiting, active: !disposed && !session.ended && !session.departing && !session.info.exited, canSay: !session.interrupting }; },
    // The same equipment master that create() validates against.
    gear: (preset: Preset) => equipment[preset],
    say: (id: string, text: string) => { const session = sessions.get(id); if (!session) throw new Error(tr("勇者が みつからない", "Hero not found")); return say(session, text, pendingChanged); },
    sessionLabel: (id: string) => sessions.get(id)?.name,
    getSession: (id: string) => sessions.get(id)?.info,
    listSessions: () => [...sessions.values()].map((session) => session.info),
    refreshBranch: async (id: string) => { const session = sessions.get(id); if (session) session.info.branch = await worktreeBranch(session.info.cwd); },
    sessionForAgent: (agent: string) => [...sessions.values()].find((item) => item.agentId === agent)?.info,
    activeTownKeys: () => new Set([...sessions.values()]
      .filter((session) => !session.info.exited && AGENTS[session.info.preset].hero).map((session) => session.info.project)),
  };
}
