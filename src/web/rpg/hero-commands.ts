import { tr } from "../language";
import type { AgentEvent } from "../../core/events";
import type { RoomAgent } from "../../core/room";
import { waitingAfterEvent } from "../../core/session-actions";
import { showBattleCommands } from "../town/battle-commands";
import { showHeroCommands } from "../town/command";
import type { Walker } from "../town/walkers";
import type { initTalk } from "./talk";

type Commands = Parameters<typeof showHeroCommands>[3];
type Actions = Pick<Commands, "working" | "plan" | "interrupt" | "compact" | "farewell" | "equip">
  & Pick<Parameters<typeof showBattleCommands>[3], "steer">;

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

// The battle's own command window; (x, y) is its bottom-right corner in battle pixels.
export function openBattleCommands(layer: HTMLElement, canvas: HTMLCanvasElement, size: [number, number],
  name: string, x: number, y: number, actions: Actions, on: { back: () => void; closed: () => void }) {
  const rect = canvas.getBoundingClientRect(), [w, h] = size;
  const { working, steer, interrupt } = actions;
  return showBattleCommands(layer, name, [x * rect.width / w, y * rect.height / h], { working, steer, interrupt, ...on });
}

export function initHeroActions(hero: (id: string) => RoomAgent | undefined, talk: ReturnType<typeof initTalk>,
  prepareDeparture: (id: string) => () => void, closeStrength: () => void, say: (text: string) => void,
  name: (id: string) => string | undefined,
  equip: (id: string, layer: HTMLElement, at: [number, number], dismiss: () => void) => void) {
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
    const held = talk.pendingCount(terminal);
    const depart = action === "farewell" ? prepareDeparture(id) : undefined;
    if (action === "interrupt") talk.interrupting(terminal, true);
    // Said before the request, so the log reads "saw off" before the hero's own SessionEnd "set off".
    if (action === "farewell") say(tr(`${heroName}を みおくりました。`, `You saw ${heroName} off.`));
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(terminal)}/action?${new URLSearchParams({ token })}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error ?? tr(`つかえませんでした（${response.status}）`, `Action failed (${response.status})`));
      }
      if (action === "farewell") {
        talk.close(); closeStrength(); depart?.();
      } else {
        if (action === "interrupt") {
          interrupted.add(terminal); eventAt.set(terminal, Date.now()); waiting.set(terminal, true); talk.setPending(terminal, []);
        } else waiting.set(terminal, false);
        talk.open(id);
        talk.notice(action === "interrupt" ? held
          ? tr(`作業を 中断した。あずかった ことば ${held}件を すてた。`, `Work interrupted. ${held} held messages discarded.`) : tr("作業を 中断した。", "Work interrupted.")
          : tr("おはなしを まとめている…", "Resting…"));
      }
    } catch (error) {
      if (action === "farewell") say(tr(`${heroName}を みおくれなかった。`, `Could not see ${heroName} off.`));
      talk.open(id); talk.notice(error instanceof Error ? error.message : String(error));
    } finally {
      busy.delete(terminal);
      if (action === "interrupt") talk.interrupting(terminal, false);
    }
  }
  // Tell a working hero now (stage 9); a waiting hero takes it as a new request.
  async function steer(id: string, text: string): Promise<string> {
    const agent = hero(id), terminal = agent?.terminal;
    if (!terminal) throw new Error(tr("この勇者には つたえられません", "Cannot reach this hero"));
    const response = await fetch(`/api/sessions/${encodeURIComponent(terminal)}/say?${new URLSearchParams({ token })}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, steer: true }),
    });
    const result = await response.json().catch(() => ({})) as { delivered?: boolean; error?: string };
    if (!response.ok) throw new Error(result.error ?? tr(`つたえられませんでした（${response.status}）`, `Could not send (${response.status})`));
    return result.delivered ? tr(`${name(id) ?? agent.name}に つたえた！`, `Sent to ${name(id) ?? agent.name}!`) : tr("あずかった！ たたかいの あとで つたえる", "Held! Will send after battle");
  }
  function options(id: string): Actions {
    const terminal = hero(id)?.terminal;
    return { working: !terminal || !waiting.get(terminal),
      ...(terminal ? {
        plan: (text: string) => { talk.open(id); void talk.sendText(text); },
        steer: (text: string) => steer(id, text),
        equip: (layer: HTMLElement, at: [number, number], dismiss: () => void) => equip(id, layer, at, dismiss),
        interrupt: () => void act(id, "interrupt"), compact: () => void act(id, "compact"), farewell: () => void act(id, "farewell"),
      } : {}),
    };
  }
  return { observe, options,
    reset: () => { waiting.clear(); eventAt.clear(); interrupted.clear(); } };
}
