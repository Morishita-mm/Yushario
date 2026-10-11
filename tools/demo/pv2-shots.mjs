// Approved S8.6: 60 half-second beats, original packets/receipt intervals intact.
import { main, party, pi, townPi, sessions, names } from './pv-shots.mjs';
export { sessions, names };
const prefix = (rows, end) => rows.slice(0, end + 1).filter(r => r.event).map(({ event, at }) => ({ event, at }));
const town = [...prefix(party, 0), ...prefix(pi, 4), ...prefix(townPi, 4)].sort((a, b) => a.at - b.at);
const hero = rows => rows[0].event.agent;
const M = (end, live = []) => ({ events: prefix(main, end), id: hero(main), follow: true,
  origin: [['v2/main', end]], live: live.map(i => main[i]), anchor: main[live.at(-1) ?? end].at });
const C = (end, live = []) => ({ events: prefix(party, end), id: hero(party), follow: true,
  origin: [['v3/main', end, ...live]], live: live.map(i => party[i]), anchor: party[26].at });
const P = (end, live = []) => ({ events: prefix(pi, end), id: hero(pi), follow: true,
  origin: [['v3/pi-1', end, ...live]], live: live.map(i => pi[i]), anchor: pi[6].at });
const world = { events: town, id: hero(party), origin: [['v3/main', 0], ['v3/pi-1', 4], ['v3/pi-2', 4]], anchor: town.at(-1).at };
const spec = [
  [0, 1, 'hit', M(39), 90601, 0, 1000],
  [1, 2, 'opening'],
  [2, 4, 'world', { ...world, world: true }, 95000, 0, 2000],
  [4, 6, 'town', { ...world, follow: true }, 98000, 0, 2000],
  [6, 7, 'claude', M(39), 100800, 0, 800],
  [7, 8, 'pi', P(6), 108000, 0, 500],
  [8, 8.5, 'hit', M(39), 91101, 0, 500],
  [8.5, 10, 'test', P(6, [7]), 117300, 0, 850],
  [10, 10.5, 'black'],
  [10.5, 12, 'level', M(67, [69]), 126600, 0, 1500],
  [12, 14, 'beyond'],
  [14, 15, 'back', C(27), 139000, 0, 20],
  [15, 16, 'reveal', C(27), 140000, 20, 40],
  [16, 18, 'party', C(27), 141000, 40, 50],
  [18, 19, 'dragon', C(27), 143000, 50, 55],
  [19, 20, 'hands', C(27), 144000, 55, 60],
  [20, 21, 'hero-hit', C(27), 144601, 60, 68],
  [21, 22, 'party-hit', C(28, [29, 30]), 155301, 69, 322],
  [22, 23, 'dragon-hit', C(32), 162601, 830, 1000],
  [23, 24, 'return', C(32), 163601, 1000, 1182],
  [24, 26, 'title'],
  [26, 30, 'cta'],
];
export const shots = spec.map(([start, end, kind, state, motion = 170000, ageStart = 0, ageEnd = 0], i) => ({
  number: i + 1, start, seconds: end - start, startBeat: start * 2, endBeat: end * 2,
  kind, state, motion, ageStart, ageEnd,
}));
if (shots.reduce((n, s) => n + s.seconds * 30, 0) !== 900) throw Error('PV2 must have exactly 900 frames');
export const contactTimes = [0.5, 20.5, 21.5, 22.5];
