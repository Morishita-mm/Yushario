import "@fontsource/dotgothic16/400.css";
import { parseAgentEvent, type AgentEvent } from "../../core/events";
import { Room } from "../../core/room";
import { narrate, stats } from "../../core/story";
import { Messages, Status, type Permission } from "./hud";
import { Scene } from "./scene";
import { loadTowns } from "./ledger";
import { initExpedition } from "./expedition";
import { initTalk } from "./talk";
import "./rpg.css";
import "./talk.css";

const token = new URLSearchParams(location.search).get("token") ?? "";
const canvas = document.querySelector<HTMLCanvasElement>("#world")!;
const connectionLabel = document.querySelector<HTMLElement>("#connection")!;
document.querySelector<HTMLAnchorElement>("#live2d-link")!.search = location.search;
const scene = new Scene(canvas, document.querySelector<HTMLElement>("#town-layer")!,
  (id) => talk.open(id), (terminal) => void expedition.openTerminal(terminal),
  (id) => status.openDetails(room, Date.now(), id, scene.names),
  (text, at) => messages.say(text, at));
const messages = new Messages(document.querySelector<HTMLElement>("#messages")!);
let room = new Room();
let socket: WebSocket | undefined;
const expedition = initExpedition(() => scene.currentTown, (terminal) => {
  const agent = [...room.agents.values()].find((item) => item.terminal === terminal);
  return agent && (scene.names.get(agent.id) ?? agent.name);
}, (session, towns) => {
  // The session registers its town before returning, even before its hero arrives.
  scene.setTowns(towns);
  scene.enterTown(session.project, () => talk.openSession(session.id));
});
const talk = initTalk((id) => room.agents.get(id), (id) => scene.names.get(id),
  (terminal) => void expedition.openTerminal(terminal),
  (terminal) => [...room.agents.values()].find((agent) => agent.terminal === terminal));
const status = new Status(
  document.querySelector<HTMLElement>("#party")!,
  (id, decision) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "permission-decision", id, decision }));
  },
  (agent) => scene.select(agent),
  (terminal) => void expedition.openTerminal(terminal),
);

function parse(input: unknown, at: unknown): { event: AgentEvent; at: number } | undefined {
  const result = parseAgentEvent(input);
  if (result.ok && typeof at === "number" && Number.isFinite(at)) return { event: result.event, at };
}

// A live event: update the world, then tell it as a story.
function live(event: AgentEvent, at: number): void {
  const before = room.agents.get(event.agent ?? "default");
  const level = before ? stats(before, at).level : 1;
  const agent = room.apply(event, at);
  const levelUp = agent !== undefined && stats(agent, at).level > level;
  scene.sync(room, at);
  const line = narrate({ ...event, name: scene.names.get(event.agent ?? "default") ?? event.name });
  if (line) messages.say(line, at);
  if (levelUp) messages.say(`${scene.names.get(agent!.id) ?? agent!.name}は レベル${stats(agent!, at).level}に あがった！`, at);
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
        talk.resetPending();
        const told: [string, number][] = [];
        for (const item of data.events) {
          const parsed = parse(item?.event, item?.at);
          if (!parsed) continue;
          room.apply(parsed.event, parsed.at);
          scene.sync(room, parsed.at, true);
          const line = narrate({ ...parsed.event, name: scene.names.get(parsed.event.agent ?? "default") ?? parsed.event.name });
          if (line) told.push([line, parsed.at]);
        }
        scene.sync(room, Date.now());
        for (const [line, at] of told.slice(-3)) messages.say(line, at, true);
        if (!told.length) messages.say("ここは エージェントたちの まち。 ゆうしゃの とうちゃくを まっている…", undefined, true);
      } else if (data.type === "towns" && Array.isArray(data.towns)) {
        scene.setTowns(data.towns);
      } else if (data.type === "pending" && typeof data.terminal === "string" && Array.isArray(data.texts)
        && data.texts.every((text: unknown) => typeof text === "string")) {
        talk.setPending(data.terminal, data.texts);
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
    scene.sync(room, now);
    status.render(room, now, scene.selected, scene.names);
    expedition.updateTitle();
    talk.update();
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
  connect();
  requestAnimationFrame(frame);
}).catch((error: unknown) => {
  connectionLabel.textContent = "町の絵を よみこめませんでした";
  console.error(error);
});
