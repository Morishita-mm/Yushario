import type { Candidate } from "../core/decider";
import { parseAgentEvent, type AgentEvent } from "../core/events";
import { MockDecider } from "../core/mock-decider";
import { MotionGenerator } from "../core/motion";
import { selectCandidate } from "../core/selector";
import { PlaceholderRenderer } from "./renderers/placeholder";
import { Live2DRenderer } from "./renderers/live2d";
import type { Renderer } from "./renderers/renderer";
import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#character")!;
const stateLabel = document.querySelector<HTMLElement>("#state")!;
const connectionLabel = document.querySelector<HTMLElement>("#connection")!;
const rendererLabel = document.querySelector<HTMLElement>("#renderer-status")!;
let renderer: Renderer | undefined;
let previous: Candidate | undefined;
void (async () => {
  try {
    const live2d = new Live2DRenderer(canvas);
    await live2d.init(new URLSearchParams(location.search).get("model") ?? undefined);
    renderer = live2d;
    if (previous) renderer.setExpression?.(previous.expression);
    rendererLabel.textContent = "Live2D";
  } catch (error) {
    // A canvas that has acquired WebGL cannot acquire 2D; replace it before falling back.
    const fallbackCanvas = canvas.cloneNode(false) as HTMLCanvasElement;
    canvas.replaceWith(fallbackCanvas);
    renderer = new PlaceholderRenderer(fallbackCanvas);
    rendererLabel.textContent = `Placeholder: ${error instanceof Error ? error.message : String(error)}`;
  }
})();
const decider = new MockDecider();
const motion = new MotionGenerator(Math.random);
let lastDecisionMs = performance.now();
let latestEvent = 0;
const recent: AgentEvent[] = [];

async function acceptEvent(event: AgentEvent): Promise<void> {
  const sequence = ++latestEvent;
  const now = performance.now();
  recent.push(event);
  if (recent.length > 10) recent.shift();
  const candidates = await decider.decide({ event, recent: [...recent], previous, elapsedMs: now - lastDecisionMs });
  // Ignore a stale decision if a newer event arrived while deciding.
  if (sequence !== latestEvent) return;
  const selected = selectCandidate(candidates, Math.random);
  const changed = !previous || selected.expression !== previous.expression
    || selected.posture !== previous.posture || selected.gesture !== previous.gesture;
  previous = selected;
  motion.setTarget(selected);
  renderer?.setExpression?.(selected.expression);
  if (changed && selected.gesture) renderer?.playGesture?.(selected.gesture);
  lastDecisionMs = now;
  stateLabel.textContent = event.state;
  stateLabel.title = event.detail ?? "";
}

function connect(): void {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}/ws`);
  connectionLabel.textContent = "接続中…";
  socket.onopen = () => { connectionLabel.textContent = "接続済み"; };
  socket.onmessage = (message) => {
    try {
      const result = parseAgentEvent(JSON.parse(message.data));
      if (!result.ok) {
        console.warn("Invalid relay event:", result.error);
        return;
      }
      void acceptEvent(result.event).catch((error) => console.error("Decision failed:", error));
    } catch (error) {
      console.warn("Invalid relay message:", error);
    }
  };
  socket.onerror = () => socket.close();
  socket.onclose = () => {
    connectionLabel.textContent = "切断・再接続待ち";
    setTimeout(connect, 3000);
  };
}

let lastFrameMs: number | undefined;
function frame(now: number): void {
  renderer?.apply(motion.update(lastFrameMs === undefined ? 0 : now - lastFrameMs));
  lastFrameMs = now;
  requestAnimationFrame(frame);
}

void acceptEvent({ state: "idle" });
connect();
requestAnimationFrame(frame);
