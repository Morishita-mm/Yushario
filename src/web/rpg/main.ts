import "@fontsource/dotgothic16/400.css";
import { parseAgentEvent, type AgentEvent } from "../../core/events";
import { Room } from "../../core/room";
import { narrate, stats } from "../../core/story";
import { Messages, Status, type Permission } from "./hud";
import { Scene } from "./scene";
import { loadTowns, type TownRecord } from "./ledger";
import type { Session } from "../terminal";
import { initHeroActions } from "./hero-commands";
import { initEquipment } from "./equipment";
import { initRoster } from "./roster";
import { initExpedition } from "./expedition";
import { initTerminals } from "./terminals";
import { initHelp } from "./help";
import { initTalk } from "./talk";
import { initNotices } from "./notices";
import { loadNames, parseNames } from "./names";
import "./rpg.css";
import "./talk.css";

const token = new URLSearchParams(location.search).get("token") ?? "";
const canvas = document.querySelector<HTMLCanvasElement>("#world")!;
const connectionLabel = document.querySelector<HTMLElement>("#connection")!;
const scene = new Scene(canvas, document.querySelector<HTMLElement>("#town-layer")!,
  (id, at) => talk.open(id, at), (terminal) => void expedition.openTerminal(terminal),
  (id) => status.openDetails(room, Date.now(), id, scene.names),
  (text, at) => messages.say(text, at), (id) => actions.options(id), (terminal) => equipment.tiers(terminal));
const messages = new Messages(document.querySelector<HTMLElement>("#messages")!, (id) => scene.names.get(id));
let room = new Room();
let socket: WebSocket | undefined;
const expedition = initExpedition(() => scene.currentTown, (terminal) => {
  const agent = [...room.agents.values()].find((item) => item.terminal === terminal);
  return agent && (scene.names.get(agent.id) ?? agent.name);
}, arrived, (terminal) => [...room.agents.values()].find((agent) => agent.terminal === terminal)?.id,
  (id) => talk.open(id));
function arrived(session: Session, towns: TownRecord[], recalled = false): void {
  equipment.remember(session);
  // Launch and recall both register the town before the hero reaches its gate.
  scene.setTowns(towns); scene.expectArrival(session.id);
  scene.enterTown(session.project, () => talk.openSession(session.id, recalled));
}
initRoster((session, towns) => arrived(session, towns, true));
initHelp();
initTerminals((terminal) => {
  const agent = [...room.agents.values()].find((item) => item.terminal === terminal);
  return agent && (scene.names.get(agent.id) ?? agent.name);
}, (terminal) => void expedition.openTerminal(terminal));
const talk = initTalk((id) => room.agents.get(id), (id) => scene.names.get(id),
  (terminal) => void expedition.openTerminal(terminal),
  (terminal) => [...room.agents.values()].find((agent) => agent.terminal === terminal), scene.art);
const equipment = initEquipment((id) => room.agents.get(id), (id) => scene.names.get(id),
  (text) => messages.say(text, Date.now()), (terminal) => [...room.agents.values()].find((agent) => agent.terminal === terminal));
const status = new Status(
  document.querySelector<HTMLElement>("#party")!,
  (id, decision) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "permission-decision", id, decision }));
  },
  (agent) => scene.select(agent),
  (terminal) => void expedition.openTerminal(terminal),
  namesChanged,
  (id) => scene.select(id, true),
  equipment.describe,
);
function namesChanged(names: Record<string, string>): void {
  scene.savedNames.clear();
  for (const [id, name] of Object.entries(names)) scene.savedNames.set(id, name);
  scene.sync(room, Date.now()); talk.update();
}

const actions = initHeroActions((id) => room.agents.get(id), talk,
  (id) => scene.prepareDeparture(id), () => status.closeDetails(), (text) => messages.say(text, Date.now()),
  (id) => scene.names.get(id), equipment.open);

const notices = initNotices(document.querySelector<HTMLElement>("#herald")!, (notice) => {
  scene.visitNotice(notice.repo, notice.hero, notice.at);
});

function parse(input: unknown, at: unknown): { event: AgentEvent; at: number } | undefined {
  const result = parseAgentEvent(input);
  if (result.ok && typeof at === "number" && Number.isFinite(at)) return { event: result.event, at };
}

const endedTerminals = new Set<string>();
function currentTerminal(event: AgentEvent): boolean {
  if (!event.terminal) return true;
  if (endedTerminals.has(event.terminal)) return false;
  const previous = room.agents.get(event.agent ?? "default")?.terminal;
  if (previous && previous !== event.terminal) {
    if (event.hook !== "SessionStart" || event.subagent) return false;
    endedTerminals.add(previous);
  }
  if (event.hook === "SessionEnd" && !event.subagent) endedTerminals.add(event.terminal);
  return true;
}

// A live event: update the world, then tell it as a story.
function live(event: AgentEvent, at: number): void {
  if (!currentTerminal(event)) return;
  const before = room.agents.get(event.agent ?? "default");
  const level = before ? stats(before, at).level : 1;
  actions.observe(event, at);
  const agent = room.apply(event, at);
  if (event.hook === "SessionStart") void equipment.refresh().catch((error: Error) => messages.say(error.message));
  if (agent?.terminal && !event.subagent) talk.clearAttention(agent.terminal);
  const levelUp = agent !== undefined && stats(agent, at).level > level;
  scene.sync(room, at);
  talk.update();
  // A second SessionEnd (the hook arriving after the server's own) has no hero left to see off.
  if (event.hook !== "SessionEnd" || before) messages.event(event, at);
  if (levelUp) {
    const name = scene.names.get(agent!.id) ?? agent!.name;
    messages.say(`${name}は レベル${stats(agent!, at).level}に あがった！`, at, false, { id: agent!.id, name });
  }
}

function permission(value: Record<string, unknown>): Permission | undefined {
  if (typeof value.id !== "string" || typeof value.tool !== "string" || typeof value.summary !== "string") return;
  return { id: value.id, tool: value.tool, summary: value.summary,
    ...(typeof value.agent === "string" ? { agent: value.agent } : {}) };
}

function connect(): void {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const current = new WebSocket(`${protocol}//${location.host}/ws?token=${encodeURIComponent(token)}`);
  socket = current;
  connectionLabel.textContent = "せつぞく中…";
  current.onopen = () => { connectionLabel.textContent = "せつぞく ずみ"; };
  current.onmessage = (message) => {
    try {
      const data = JSON.parse(message.data);
      if (data.type === "replay" && Array.isArray(data.events)) {
        // Rebuild who is in town; retell only the last few lines.
        room = new Room();
        talk.resetPending(); actions.reset(); equipment.reset(); endedTerminals.clear();
        void equipment.refresh().catch((error: Error) => messages.say(error.message));
        const told: [AgentEvent, number][] = [];
        for (const item of data.events) {
          const parsed = parse(item?.event, item?.at);
          if (!parsed || !currentTerminal(parsed.event)) continue;
          actions.observe(parsed.event, parsed.at);
          const present = room.agents.has(parsed.event.agent ?? "default");
          room.apply(parsed.event, parsed.at);
          scene.sync(room, parsed.at, true);
          const line = parsed.event.hook === "SessionEnd" && !present ? undefined
            : narrate({ ...parsed.event, name: scene.names.get(parsed.event.agent ?? "default") ?? parsed.event.name });
          if (line) told.push([parsed.event, parsed.at]);
        }
        scene.sync(room, Date.now());
        for (const [event, at] of told.slice(-3)) messages.event(event, at, true);
        if (!told.length) messages.say("ここは エージェントたちの まち。 ゆうしゃの とうちゃくを まっている…", undefined, true);
      } else if (data.type === "names") {
        const names = parseNames(data.names);
        if (names) namesChanged(names);
      } else if (data.type === "towns" && Array.isArray(data.towns)) {
        scene.setTowns(data.towns);
      } else if (data.type === "pending" && typeof data.terminal === "string" && Array.isArray(data.texts)
        && data.texts.every((text: unknown) => typeof text === "string")) {
        talk.setPending(data.terminal, data.texts);
        equipment.setPending(data.terminal, data.equipment);
      } else if (data.type === "attention" && typeof data.terminal === "string" && data.reason === "trust") {
        if (![...room.agents.values()].some((agent) => agent.terminal === data.terminal)) talk.attention(data.terminal);
      } else if (data.type === "equipped" && typeof data.session?.id === "string") {
        equipment.changed(data.session);
      } else if (data.type === "event") {
        const parsed = parse(data.event, data.at);
        if (parsed) live(parsed.event, parsed.at);
      } else if (data.type === "permission") {
        const request = permission(data);
        if (request) status.permissions.set(request.id, request);
      } else if (data.type === "permission-resolved") {
        status.permissions.delete(data.id);
      }
    } catch (error) {
      console.warn("Invalid relay message:", error);
    }
  };
  current.onerror = () => current.close();
  current.onclose = () => {
    status.permissions.clear();
    connectionLabel.textContent = "せつだん… さいせつぞく まち";
    setTimeout(connect, 3000);
  };
}

let lastStatus = 0;
function frame(time: number): void {
  const now = Date.now();
  if (now - lastStatus > 250) {
    talk.update();
    scene.sync(room, now);
    notices(room, scene.projects, status.permissions, scene.names, now);
    status.render(room, now, scene.selected, scene.names, scene.currentTown);
    expedition.updateTitle();
    lastStatus = now;
  }
  scene.frame(time, now);
  messages.tick();
  talk.tick(time);
  requestAnimationFrame(frame);
}

void scene.load().then(async () => {
  try { scene.setTowns(await loadTowns()); }
  catch (error) {
    messages.say("町の台帳を よみこめませんでした。せつぞくを おたしかめください。", undefined, true);
    console.warn(error);
  }
  try { namesChanged(await loadNames()); }
  catch (error) { messages.say("勇者の なまえを よみこめませんでした。", undefined, true); console.warn(error); }
  connect();
  requestAnimationFrame(frame);
}).catch((error: unknown) => {
  connectionLabel.textContent = "町の絵を よみこめませんでした";
  console.error(error);
});
