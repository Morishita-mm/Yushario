import type { Activity } from "../../core/activity";
import { moods, type Mood, type RoomAgent } from "../../core/room";
import { battleMonster } from "../../core/story";
import type { Pose } from "./art/people";
import type { Balloon } from "./effects";
import { BEDS, LANES, SPOTS } from "./world";

type Point = { x: number; y: number };

export interface Actor extends Point {
  walking: boolean;
  dx: number; // last horizontal movement, for facing
  dy: number;
  seed: number; // de-synchronises animations
}

const STATION: Partial<Record<Activity, Point>> = {
  read: SPOTS.library, search: SPOTS.library, plan: SPOTS.board, rest: SPOTS.church,
  web: { x: 273, y: 39 }, git: SPOTS.crystal, think: SPOTS.campfire, tool: SPOTS.shop, ask: SPOTS.you,
};
const SPEED = 60; // map pixels per second

// Stable lane / bed per agent, so characters do not swap places.
export class Places {
  private lanes = new Map<string, number>();
  private beds = new Map<string, number>();

  release(present: Set<string>): void {
    for (const map of [this.lanes, this.beds]) for (const id of map.keys()) if (!present.has(id)) map.delete(id);
  }

  lane(id: string, battling: boolean): number | undefined {
    if (!battling) {
      this.lanes.delete(id);
      return;
    }
    return claim(this.lanes, id, LANES.length);
  }

  bed(id: string): number {
    return claim(this.beds, id, BEDS.length);
  }
}

function claim(map: Map<string, number>, id: string, size: number): number {
  if (!map.has(id)) {
    const taken = new Set(map.values());
    const free = Array.from({ length: size }, (_, i) => i).find((i) => !taken.has(i));
    map.set(id, free ?? map.size % size);
  }
  return map.get(id)!;
}

export function isBattle(activity: Activity): boolean {
  return battleMonster(activity) !== undefined;
}

// Where an agent should stand. `slot` spreads agents sharing a station.
export function destination(agent: RoomAgent, agentMoods: Mood[], places: Places, slot: number): Point {
  const lane = places.lane(agent.id, isBattle(agent.activity));
  if (lane !== undefined) return LANES[lane].hero;
  if (agent.activity === "idle" || agentMoods.includes("dozing")) {
    const bed = BEDS[places.bed(agent.id)];
    return agentMoods.includes("dozing") ? { x: bed.x, y: bed.y + 24 } : { x: bed.x, y: bed.y + 44 };
  }
  const station = STATION[agent.activity] ?? SPOTS.campfire;
  const offset = slot === 0 ? 0 : (slot % 2 ? 1 : -1) * Math.ceil(slot / 2) * 18;
  return { x: station.x + offset, y: station.y + (agent.activity === "think" ? 10 : 0) };
}

export function move(actor: Actor, target: Point, dtMs: number): void {
  const dx = target.x - actor.x;
  const dy = target.y - actor.y;
  const distance = Math.hypot(dx, dy);
  const step = SPEED * dtMs / 1000;
  actor.walking = distance > 0.5;
  if (!actor.walking) return;
  actor.dx = dx;
  actor.dy = dy;
  if (distance <= step) {
    actor.x = target.x;
    actor.y = target.y;
  } else {
    actor.x += dx / distance * step;
    actor.y += dy / distance * step;
  }
}

export interface Look { pose: Pose; flip: boolean; balloon?: Balloon; bob: number }

function cycle(now: number, seed: number, period: number): number {
  return ((now + seed) % period) / period;
}

export function walkLook(actor: Actor, now: number): Look {
  const step = Math.floor((now + actor.seed) / 160) % 2;
  if (Math.abs(actor.dx) >= Math.abs(actor.dy)) {
    return { pose: step ? "sidewalk" : "side", flip: actor.dx < 0, bob: 0 };
  }
  return { pose: step ? "walk1" : "walk2", flip: false, bob: 0 };
}

// Battle stance for a given activity: swings for edits, spells for commands, a braced wait for tests.
export function battleLook(activity: Activity, agentMoods: Mood[], now: number, seed: number): Pose {
  if (activity === "run") return cycle(now, seed, 1400) < 0.5 ? "side" : "cast";
  if (activity === "test") return cycle(now, seed, 2600) < 0.85 ? "side" : "windup";
  const period = agentMoods.includes("flowing") ? 650 : agentMoods.includes("tired") ? 1700 : 1100;
  const phase = cycle(now, seed, period);
  return phase < 0.55 ? "side" : phase < 0.75 ? "windup" : "slash";
}

export function look(agent: RoomAgent, actor: Actor, now: number, cheering: boolean): Look {
  const agentMoods = moods(agent, now);
  if (actor.walking) return walkLook(actor, now);
  const balloon = balloonFor(agent.activity, agentMoods);
  const breathe = Math.floor(cycle(now, actor.seed, 1400) * 2);
  if (cheering || agentMoods.includes("recovered")) return { pose: "cheer", flip: false, balloon: balloon ?? "heart", bob: 0 };
  if (agentMoods.includes("dozing")) return { pose: "sleep", flip: false, balloon: "zz", bob: 0 };
  if (isBattle(agent.activity)) {
    return { pose: battleLook(agent.activity, agentMoods, now, actor.seed), flip: false, balloon, bob: 0 };
  }
  switch (agent.activity) {
    case "read": return { pose: "read", flip: false, balloon, bob: breathe };
    case "search": return { pose: cycle(now, actor.seed, 1600) < 0.5 ? "read" : "stand", flip: false, balloon, bob: 0 };
    case "plan": return { pose: cycle(now, actor.seed, 900) < 0.5 ? "stand" : "wave2", flip: false, balloon, bob: 0 };
    case "web": return { pose: "wave2", flip: false, balloon, bob: 0 };
    case "git": case "rest": return { pose: "pray", flip: false, balloon, bob: breathe };
    case "ask": {
      const fast = agentMoods.includes("calling_long") ? 160 : 320;
      return { pose: Math.floor((now + actor.seed) / fast) % 2 ? "wave1" : "wave2", flip: false, balloon, bob: 0 };
    }
    default: return { pose: "stand", flip: false, balloon, bob: breathe };
  }
}

function balloonFor(activity: Activity, agentMoods: Mood[]): Balloon | undefined {
  if (activity === "ask") return "exclaim";
  if (agentMoods.includes("struggling")) return "sweat";
  if (agentMoods.includes("waiting_long")) return "hourglass";
  if (activity === "think") return "dots";
  if (agentMoods.includes("flowing")) return "note";
}
