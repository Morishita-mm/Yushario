import "@fontsource/dotgothic16/400.css";
import { parseAgentEvent, type AgentEvent } from "../../core/events";
import { Room } from "../../core/room";
import { narrate, stats } from "../../core/story";
import { Messages, Status, type Permission } from "./hud";
import { Scene } from "./scene";
import "./rpg.css";

const token = new URLSearchParams(location.search).get("token") ?? "";
const canvas = document.querySelector<HTMLCanvasElement>("#world")!;
const connectionLabel = document.querySelector<HTMLElement>("#connection")!;
document.querySelector<HTMLAnchorElement>("#live2d-link")!.search = location.search;
const scene = new Scene(canvas);
const messages = new Messages(document.querySelector<HTMLElement>("#messages")!);
let room = new Room();
let socket: WebSocket | undefined;
const status = new Status(
  document.querySelector<HTMLElement>("#party")!,
  (id, decision) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "permission-decision", id, decision }));
  },
  (agent) => { scene.selected = agent; },
);
canvas.addEventListener("click", (event) => { scene.selected = scene.pick(event); });

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
  scene.event(event, agent, levelUp, Date.now());
  const line = narrate(event);
  if (line) messages.say(line);
  if (levelUp) messages.say(`${agent!.name}は レベル${stats(agent!, at).level}に あがった！`);
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
        const told: string[] = [];
        for (const item of data.events) {
          const parsed = parse(item?.event, item?.at);
          if (!parsed) continue;
          room.apply(parsed.event, parsed.at);
          const line = narrate(parsed.event);
          if (line) told.push(line);
        }
        scene.settle();
        for (const line of told.slice(-3)) messages.say(line, true);
        if (!told.length) messages.say("ここは エージェントたちの まち。 ゆうしゃの とうちゃくを まっている…", true);
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

let last: number | undefined;
let lastStatus = 0;
function frame(time: number): void {
  const now = Date.now();
  scene.frame(room, now, last === undefined ? 0 : Math.min(time - last, 100));
  last = time;
  messages.tick();
  if (now - lastStatus > 250) {
    status.render(room, now, scene.selected);
    lastStatus = now;
  }
  requestAnimationFrame(frame);
}

connect();
requestAnimationFrame(frame);
