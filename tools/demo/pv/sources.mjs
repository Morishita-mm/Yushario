// Recorded demo packets and the source states used by the final cut.
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../recordings/${path}`, import.meta.url), 'utf8');
const rows = path => read(path).trim().split('\n').map(JSON.parse);
export const main = rows('report/main.jsonl'), party = rows('party/main.jsonl');
export const pi = rows('party/pi-1.jsonl'), townPi = rows('party/pi-2.jsonl');
export const demo = rows('rest/events.jsonl').filter(r => r.event);
export const sessions = [...JSON.parse(read('report/manifest.json')).sessions,
  ...JSON.parse(read('party/manifest.json')).sessions, JSON.parse(read('rest/manifest.json'))];
export const inactivity = JSON.parse(read('rest/dozing.json'));
const prefix = (source, end) => source.slice(0, end + 1).filter(r => r.event).map(({ event, at }) => ({ event, at }));
const hero = source => source[0].event.agent;
export const names = Object.fromEntries([[hero(party), 'Claude Code'], [hero(main), 'Claude Code (2)'],
  [hero(pi), 'pi'], [hero(townPi), 'pi (2)']]);
const M = (end, live = []) => ({ events: prefix(main, end), id: hero(main), follow: true,
  origin: [['v2/main', end]], live: live.map(i => main[i]), anchor: main[live.at(-1) ?? end].at });
const fourthStart = party.findLastIndex(r => r.event.hook === 'SubagentStart');
const partyEnd = party.findIndex((r, i) => i > fourthStart && r.event.hook === 'PostToolUse' && r.event.tool === 'Agent');
if (partyEnd < 0) throw Error('Missing genuine four-helper dispatch completion');
const C = () => ({ events: prefix(party, partyEnd), id: hero(party), follow: true,
  origin: [['v3/main', partyEnd]], live: [], anchor: party[partyEnd].at });
const P = (end, live = []) => ({ events: prefix(pi, end), id: hero(pi), follow: true,
  origin: [['v3/pi-1', end, ...live]], live: live.map(i => pi[i]), anchor: pi[6].at });
export const townSpecs = [['tiny-quest', 'village'], ['quiet-quest', 'port'], ['packet-notes', 'snow'],
  ['asset-cache', 'desert'], ['build-tools', 'volcano']];
const townEvents = [...prefix(party, 0), ...prefix(pi, 4), ...prefix(townPi, 4), ...prefix(main, 0)];
const crowdAnchor = Math.max(...townEvents.map(row => row.at));
const crowd = { events: townEvents, id: hero(party), origin: [['v3/main', 0], ['v3/pi-1', 4], ['v3/pi-2', 4], ['v2/main', 0]],
  anchor: crowdAnchor, receiptShift: Object.fromEntries([party, pi, townPi, main].map(source =>
    [hero(source), crowdAnchor - Math.max(...townEvents.filter(row => row.event.agent === hero(source)).map(row => row.at))])) };
// Approved filming-only project aliases and per-recording receipt translations; packets stay intact here.
const worldEvents = [party, demo, pi, townPi, main].map(source => prefix(source, 0)[0]);
const world = { events: worldEvents, id: hero(party), anchor: crowd.anchor,
  projectAliases: Object.fromEntries(worldEvents.map((row, i) => [row.event.agent, townSpecs[i][0]])),
  receiptShift: Object.fromEntries(worldEvents.map(row => [row.event.agent, crowd.anchor - row.at])),
  origin: [['v3/main', 0], ['s87/demo', 0], ['v3/pi-1', 0], ['v3/pi-2', 0], ['v2/main', 0]] };
const town = JSON.parse(read('rest/town.json'));
const D = (end, age = 0) => ({ events: prefix(demo, end), id: hero(demo), anchor: demo[end].at,
  live: [], origin: [['s87/demo', end]], towns: [town], age });
export const states = {
  hit: { state: M(39), motion: 90601, ageStart: 0, ageEnd: 1000 },
  reprise: { state: M(39), motion: 91101, ageStart: 0, ageEnd: 500 },
  world: { state: { ...world, world: true }, motion: 95000, ageStart: 0, ageEnd: 2000 },
  town: { state: { ...crowd, follow: true }, motion: 98000, ageStart: 0, ageEnd: 2000 },
  biome: { state: D(2), motion: 98000 },
  church: { state: D(demo.findIndex(r => r.event.hook === 'PreCompact')), motion: 103000, ageStart: 100, ageEnd: 2100 },
  inn: { state: D(demo.findLastIndex(r => r.event.hook === 'Notification'), 600100), motion: 105000, ageStart: 600100, ageEnd: 602100 },
  test: { state: P(6, [7]), motion: 117300, ageStart: 0, ageEnd: 850 },
  level: { state: M(67, [69]), motion: 126600, ageStart: 0, ageEnd: 1500 },
  back: { state: C(), motion: 139000, ageStart: 0, ageEnd: 20 },
  reveal: { state: C(), motion: 140000, ageStart: 20, ageEnd: 40 },
  party: { state: C(), motion: 141000, ageStart: 40, ageEnd: 50 },
  dragon: { state: C(), motion: 143000, ageStart: 50, ageEnd: 55 },
  hands: { state: C(), motion: 144000, ageStart: 55, ageEnd: 60 },
  'hero-hit': { state: C(), motion: 144601, ageStart: 60, ageEnd: 68 },
  'party-hit': { state: C(), motion: 155301, ageStart: 69, ageEnd: 322 },
  'dragon-hit': { state: C(), motion: 162601, ageStart: 830, ageEnd: 1000 },
  return: { state: C(), motion: 163601, ageStart: 1000, ageEnd: 1182 },
};
states.heroes = states.town;
