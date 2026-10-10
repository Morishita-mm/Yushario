import type { AgentEvent } from "../../core/events";
import type { RoomAgent } from "../../core/room";
import { waitingAfterEvent } from "../../core/session-actions";
import { showHeroCommands } from "../town/command";
import type { Walker } from "../town/walkers";
import type { initTalk } from "./talk";

type Commands = Parameters<typeof showHeroCommands>[3];
type Actions = Pick<Commands, "working" | "plan" | "interrupt" | "compact" | "farewell">;

export function openHeroCommands(layer: HTMLElement, canvas: HTMLCanvasElement, size: [number, number],
  name: string, walker: Walker | undefined, x: number, y: number, actions: Actions,
  on: Omit<Commands, keyof Actions>) {
  if (walker) walker.paused = true;
  const rect = canvas.getBoundingClientRect(), [w, h] = size;
  return showHeroCommands(layer, name, [x * rect.width / w, (y - 30) * rect.height / h], {
    ...on, ...actions,
    closed: () => {
      if (walker) { walker.paused = false; walker.waitUntil = performance.now(); }
      on.closed();
    },
  });
}

export function initHeroActions(hero: (id: string) => RoomAgent | undefined, talk: ReturnType<typeof initTalk>,
  prepareDeparture: (id: string) => () => void, closeStrength: () => void, say: (text: string) => void,
  name: (id: string) => string | undefined) {
  const waiting = new Map<string, boolean>();
  const busy = new Set<string>(), interrupted = new Set<string>();
  const eventAt = new Map<string, number>();
  const token = new URLSearchParams(location.search).get("token") ?? "";

  function observe(event: AgentEvent, at: number): void {
    const terminal = event.terminal;
    if (!terminal || event.subagent) return;
    if (event.hook === "SessionEnd") { waiting.delete(terminal); eventAt.delete(terminal); interrupted.delete(terminal); return; }
    if (at < (eventAt.get(terminal) ?? -Infinity)) return;
    const next = waitingAfterEvent(event, interrupted.has(terminal));
    if (next !== undefined) { waiting.set(terminal, next); eventAt.set(terminal, at); }
    if (event.hook === "UserPromptSubmit") interrupted.delete(terminal);
  }
  async function act(id: string, action: "interrupt" | "compact" | "farewell"): Promise<void> {
    const agent = hero(id), terminal = agent?.terminal;
    if (!terminal || busy.has(terminal)) return;
    busy.add(terminal);
    const heroName = name(id) ?? agent.name;
    const depart = action === "farewell" ? prepareDeparture(id) : undefined;
    if (action === "interrupt") talk.interrupting(terminal, true);
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(terminal)}/action?${new URLSearchParams({ token })}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error ?? `つかえませんでした（${response.status}）`);
      }
      if (action === "farewell") {
        talk.close(); closeStrength(); depart?.();
        say(`${heroName}を みおくりました。もんまで あるいて たびだちます。`);
      } else {
        if (action === "interrupt") {
          interrupted.add(terminal); eventAt.set(terminal, Date.now()); waiting.set(terminal, true); talk.setPending(terminal, []);
        } else waiting.set(terminal, false);
        talk.open(id);
        talk.notice(action === "interrupt" ? "にげた ので あずかった ことばを すてた" : "やすんで 会話を せいりしている…");
      }
    } catch (error) {
      talk.open(id); talk.notice(error instanceof Error ? error.message : String(error));
    } finally {
      busy.delete(terminal);
      if (action === "interrupt") talk.interrupting(terminal, false);
    }
  }
  function options(id: string): Actions {
    const terminal = hero(id)?.terminal;
    return { working: !terminal || !waiting.get(terminal),
      ...(terminal ? {
        plan: (text: string) => { talk.open(id); void talk.sendText(text); },
        interrupt: () => void act(id, "interrupt"), compact: () => void act(id, "compact"), farewell: () => void act(id, "farewell"),
      } : {}),
    };
  }
  return { observe, options,
    reset: () => { waiting.clear(); eventAt.clear(); interrupted.clear(); } };
}
