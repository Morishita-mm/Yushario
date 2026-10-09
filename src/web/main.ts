import type { Candidate } from "../core/decider";
import { parseAgentEvent, type AgentEvent } from "../core/events";
import { MotionGenerator } from "../core/motion";
import { PlaceholderRenderer } from "./renderers/placeholder";
import { Live2DRenderer } from "./renderers/live2d";
import type { Renderer } from "./renderers/renderer";
import "./style.css";
import { initTerminal } from "./terminal";

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
const motion = new MotionGenerator(Math.random);

function acceptDecision(event: AgentEvent, selected: Candidate): void {
  const changed = !previous || selected.expression !== previous.expression
    || selected.posture !== previous.posture || selected.gesture !== previous.gesture;
  previous = selected;
  motion.setTarget(selected);
  renderer?.setExpression?.(selected.expression);
  if (changed && selected.gesture) renderer?.playGesture?.(selected.gesture);
  stateLabel.textContent = event.state;
  stateLabel.title = event.detail ?? "";
}

function validCandidate(value: unknown): value is Candidate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Candidate;
  return ["neutral", "focused", "happy", "troubled", "surprised"].includes(candidate.expression)
    && ["upright", "lean_forward", "tilt", "slump"].includes(candidate.posture)
    && (candidate.gesture === undefined || ["nod", "shake", "wave", "think", "cheer", "tremble"].includes(candidate.gesture))
    && typeof candidate.score === "number" && Number.isFinite(candidate.score);
}

function connect(): void {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const token = new URLSearchParams(location.search).get("token") ?? "";
  const socket = new WebSocket(`${protocol}//${location.host}/ws?token=${encodeURIComponent(token)}`);
  connectionLabel.textContent = "接続中…";
  socket.onopen = () => { connectionLabel.textContent = "接続済み"; };
  socket.onmessage = (message) => {
    try {
      const decision = JSON.parse(message.data);
      const result = parseAgentEvent(decision.event);
      if (decision.type !== "decision" || !result.ok || !validCandidate(decision.candidate)) {
        console.warn("Invalid relay decision");
        return;
      }
      acceptDecision(result.event, decision.candidate);
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

stateLabel.textContent = "idle";
initTerminal();
connect();
requestAnimationFrame(frame);
