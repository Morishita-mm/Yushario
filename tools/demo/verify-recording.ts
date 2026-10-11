// Evidence check, not a mocked WS/rendering test: real recording -> existing pure core.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Room, type RoomAgent } from '../../src/core/room';
import { stats } from '../../src/core/story';
import type { AgentEvent } from '../../src/core/events';
type Row = { type: string; recordedAt: number; at?: number; event?: AgentEvent };
type Entry = { atMs: number; originFile: string; originIndex: number; event?: AgentEvent; permission?: Row; resolved?: Row };
const [input, liveInput] = process.argv.slice(2);
if (!input) throw new Error('Usage: tsx tools/demo/verify-recording.ts <timeline.json> [live-relay.jsonl]');
const recording = JSON.parse(readFileSync(input, 'utf8')) as { timeline: Entry[] };
const readRows = (path: string): Row[] => readFileSync(path, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
const sources = new Map<string, Row[]>();
const room = new Room(), milestones: object[] = [];
const details = (agent: RoomAgent, at: number) => ({ id: agent.id, project: agent.project, wins: agent.wins,
  quests: agent.quests, ...stats(agent, at), reports: agent.talk.filter((entry) => entry.report).map((entry) => entry.report) });
for (const entry of recording.timeline) {
  const file = resolve(dirname(input), entry.originFile);
  if (!sources.has(file)) sources.set(file, readRows(file));
  const original = sources.get(file)![entry.originIndex];
  const actual = entry.event ?? entry.permission ?? entry.resolved;
  if (JSON.stringify(actual) !== JSON.stringify(entry.event ? original.event : original)) throw new Error(`Changed source: ${entry.originFile} #${entry.originIndex}`);
  if (!entry.event) continue;
  const before = room.agents.get(entry.event.agent!);
  const level = before ? stats(before, entry.atMs).level : 1;
  const agent = room.apply(entry.event, entry.atMs);
  if (agent && stats(agent, entry.atMs).level > level) milestones.push({ originFile: entry.originFile,
    originIndex: entry.originIndex, atMs: entry.atMs, hook: entry.event.hook, tool: entry.event.tool,
    target: entry.event.target, wins: agent.wins, quests: agent.quests, level: stats(agent, entry.atMs).level });
}
const expected = [...room.agents.values()].map((agent) => details(agent, recording.timeline.at(-1)!.atMs));
let live;
const liveMilestones: object[] = [];
if (liveInput) {
  const received = new Room();
  for (const row of readRows(liveInput)) if (row.event) {
    const before = received.agents.get(row.event.agent!);
    const level = before ? stats(before, row.at!).level : 1;
    const agent = received.apply(row.event, row.at!);
    if (agent && stats(agent, row.at!).level > level) liveMilestones.push({ at: row.at,
      hook: row.event.hook, tool: row.event.tool, target: row.event.target, wins: agent.wins,
      quests: agent.quests, level: stats(agent, row.at!).level });
  }
  live = [...received.agents.values()].map((agent) => details(agent, Date.now()));
  for (const agent of expected) {
    const match = live.find((item) => item.id === agent.id);
    if (!match || match.wins !== agent.wins || match.quests !== agent.quests || match.level !== agent.level)
      throw new Error(`Live relay replay differs: ${agent.id}`);
  }
  if (live.length !== expected.length) throw new Error('Live relay has additional/missing heroes');
}
console.log(JSON.stringify({ input, observations: recording.timeline.length, sourceContentUnchanged: true,
  milestones, expected, ...(live ? { liveReplayMatches: true, liveMilestones, live } : {}) }, null, 2));
