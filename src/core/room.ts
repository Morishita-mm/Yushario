import { classifyActivity, toolActivity, type Activity } from "./activity";
import type { AgentEvent, TaskStatus } from "./events";
import { attachReports, emptyTurns, recordTurn, type TalkEntry, type Turns } from "./turns";

// How an agent is doing, derived from its recent history (docs/OBSERVATION.md).
export type Mood =
  | "waiting_long" | "struggling" | "recovered" | "flowing" | "tired" | "calling_long" | "dozing";

// Initial thresholds; tune them by watching real sessions.
export const MOOD_RULES = {
  waitingMs: 30_000,
  struggleWindowMs: 5 * 60_000,
  struggleFailures: 3,
  recoveredMs: 10_000,
  flowWindowMs: 60_000,
  flowEdits: 5,
  tiredContext: 0.7,
  callingMs: 60_000,
  dozingMs: 10 * 60_000,
} as const;
const TALK_LIMIT = 30;
const LOG_LIMIT = 50;
const TASK_LIMIT = 50;
const HISTORY_LIMIT = 20;

export type { TalkEntry, TalkReport } from "./turns";

export interface RoomTask { id: string; subject?: string; status: Exclude<TaskStatus, "deleted"> }
export interface Helper { id: string; type?: string; activity: Activity; target?: string }
export interface LogEntry { at: number; activity: Activity; target?: string; outcome?: "ok" | "failed" }

export type DownState = { at: number; active: boolean };
// Only a new main request clears a fall. Other progress, reading a report and
// elapsed time do not; late hooks cannot undo a newer request/fall.
export function downAfterEvent(current: DownState | undefined, event: AgentEvent, at: number): DownState | undefined {
  if (event.subagent || !["UserPromptSubmit", "StopFailure"].includes(event.hook ?? "") || at < (current?.at ?? -Infinity)) return current;
  return { at, active: event.hook === "StopFailure" };
}

export interface RoomAgent {
  id: string;
  name: string;
  terminal?: string;
  project?: string;
  activity: Activity;
  target?: string;
  since: number; // When the current activity (or its target) began.
  running: boolean; // A tool started and has not finished yet.
  lastEventAt: number;
  context?: number;
  down?: DownState;
  failures: number[];
  edits: number[];
  wins: number; // Tools that finished successfully, for the whole session.
  quests: number; // Tasks completed.
  recoveredAt?: number;
  tasks: RoomTask[];
  helpers: Helper[];
  log: LogEntry[]; // Oldest first.
  talk: TalkEntry[]; // Local conversation, oldest first; replies carry their round's report.
  activityAt: number; // Hooks post concurrently; older events never overwrite newer activity.
  postAt: number;
  contextAt: number;
}

export class Room {
  readonly agents = new Map<string, RoomAgent>();
  private readonly turns = new Map<string, Turns>();

  // `at` is the event time in ms. Returns the agent the event belongs to, if it is still present.
  apply(event: AgentEvent, at: number): RoomAgent | undefined {
    const id = event.agent ?? "default";
    if (event.hook === "SessionEnd" && !event.subagent) {
      this.agents.delete(id);
      this.turns.delete(id);
      return;
    }
    let agent = this.agents.get(id);
    if (!agent) {
      agent = {
        id, name: event.name ?? "agent", activity: "idle", since: at, running: false, lastEventAt: at,
        failures: [], edits: [], wins: 0, quests: 0, tasks: [], helpers: [], log: [], talk: [],
        activityAt: -Infinity, postAt: -Infinity, contextAt: -Infinity,
      };
      this.agents.set(id, agent);
    }
    if (event.name) agent.name = event.name;
    if (event.terminal) agent.terminal = event.terminal;
    if (event.project) agent.project = event.project;
    agent.lastEventAt = Math.max(agent.lastEventAt, at);
    agent.down = downAfterEvent(agent.down, event, at);
    if (!event.subagent) {
      if (event.context !== undefined && at >= agent.contextAt) {
        agent.context = event.context;
        agent.contextAt = at;
      }
      this.updateTalk(agent, event, at);
    }
    if (event.task) updateTask(agent, event.task);
    if (event.subagent) updateHelper(agent, event);
    else updateActivity(agent, event, at);
    updateOutcome(agent, event, at);
    return agent;
  }

  private updateTalk(agent: RoomAgent, event: AgentEvent, at: number): void {
    const turns = this.turns.get(agent.id) ?? emptyTurns();
    this.turns.set(agent.id, turns);
    recordTurn(turns, event, at);
    const reply = event.hook === "Stop" || event.hook === "StopFailure";
    if (event.text !== undefined && (event.hook === "UserPromptSubmit" || reply)) {
      agent.talk.push({ at, from: reply ? "hero" : "you", text: event.text });
      agent.talk.sort((left, right) => left.at - right.at);
      if (agent.talk.length > TALK_LIMIT) agent.talk.shift();
    }
    attachReports(agent.talk, turns);
  }
}

function updateTask(agent: RoomAgent, task: NonNullable<AgentEvent["task"]>): void {
  const index = agent.tasks.findIndex((item) => item.id === task.id);
  if (task.status === "completed" && agent.tasks[index]?.status !== "completed") agent.quests++;
  if (task.status === "deleted") {
    if (index >= 0) agent.tasks.splice(index, 1);
    return;
  }
  const subject = task.subject ?? agent.tasks[index]?.subject;
  const next: RoomTask = { id: task.id, status: task.status, ...(subject ? { subject } : {}) };
  if (index >= 0) agent.tasks[index] = next;
  else if (agent.tasks.length < TASK_LIMIT) agent.tasks.push(next);
}

function updateHelper(agent: RoomAgent, event: AgentEvent): void {
  const { id, type } = event.subagent!;
  const index = agent.helpers.findIndex((helper) => helper.id === id);
  if (event.hook === "SubagentStop") {
    if (index >= 0) agent.helpers.splice(index, 1);
    return;
  }
  const helper = index >= 0 ? agent.helpers[index] : { id, activity: "think" as Activity };
  if (index < 0) agent.helpers.push(helper);
  if (type) helper.type = type;
  const activity = classifyActivity(event);
  if (activity) {
    helper.activity = activity;
    helper.target = event.target;
  }
}

function updateActivity(agent: RoomAgent, event: AgentEvent, at: number): void {
  // An answered permission resumes the tool that asked: show its result instead of the call.
  const resumed = agent.activity === "ask" && event.hook === "PostToolUse" && event.tool;
  const activity = classifyActivity(event) ?? (resumed ? toolActivity(event.tool!, event.target) : undefined);
  if (!activity || at < agent.activityAt) return;
  const target = event.hook === "PreToolUse" || resumed ? event.target : undefined;
  if (activity !== agent.activity || target !== agent.target) agent.since = at;
  if (activity !== agent.activity || event.hook === "PreToolUse") {
    agent.log.push({ at, activity, ...(target ? { target } : {}) });
    if (agent.log.length > LOG_LIMIT) agent.log.shift();
  }
  agent.activity = activity;
  agent.target = target;
  agent.activityAt = at;
  agent.running = event.hook === "PreToolUse" && at > agent.postAt;
}

function updateOutcome(agent: RoomAgent, event: AgentEvent, at: number): void {
  const finished = event.hook === "PostToolUse" || event.hook === "PostToolUseFailure";
  if (finished && !event.subagent) {
    agent.postAt = Math.max(agent.postAt, at);
    if (at >= agent.activityAt) agent.running = false;
  }
  const failed = event.state === "error" && (finished || event.hook === "StopFailure");
  if (!failed && event.hook !== "PostToolUse") return;
  const activity = event.tool ? toolActivity(event.tool, event.target) : undefined;
  if (failed) {
    push(agent.failures, at);
  } else {
    agent.wins++;
    if (struggling(agent, at)) {
      agent.recoveredAt = at;
      agent.failures = [];
    }
    if (activity === "edit") push(agent.edits, at);
  }
  if (event.subagent) return;
  for (let i = agent.log.length - 1; i >= 0; i--) {
    const entry = agent.log[i];
    if (entry.outcome || entry.activity !== activity) continue;
    entry.outcome = failed ? "failed" : "ok";
    break;
  }
}

function push(times: number[], at: number): void {
  times.push(at);
  if (times.length > HISTORY_LIMIT) times.shift();
}

function within(times: number[], now: number, windowMs: number): number {
  return times.filter((at) => at <= now && now - at < windowMs).length;
}

function struggling(agent: RoomAgent, now: number): boolean {
  return within(agent.failures, now, MOOD_RULES.struggleWindowMs) >= MOOD_RULES.struggleFailures;
}

export function moods(agent: RoomAgent, now: number): Mood[] {
  const result: Mood[] = [];
  if (agent.running && now - agent.since >= MOOD_RULES.waitingMs) result.push("waiting_long");
  if (struggling(agent, now)) result.push("struggling");
  if (agent.recoveredAt !== undefined && now - agent.recoveredAt < MOOD_RULES.recoveredMs) result.push("recovered");
  if (within(agent.edits, now, MOOD_RULES.flowWindowMs) >= MOOD_RULES.flowEdits
    && within(agent.failures, now, MOOD_RULES.flowWindowMs) === 0) result.push("flowing");
  if ((agent.context ?? 0) >= MOOD_RULES.tiredContext) result.push("tired");
  if (agent.activity === "ask" && now - agent.since >= MOOD_RULES.callingMs) result.push("calling_long");
  if (now - agent.lastEventAt >= MOOD_RULES.dozingMs) result.push("dozing");
  return result;
}
