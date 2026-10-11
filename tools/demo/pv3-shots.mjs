// S8.7: 39s/180 BPM (0.5s dotted-quarter edit pulse); genuine compact/doze/themes.
import { readFileSync } from 'node:fs';
import { shots as previous, sessions as oldSessions, names } from './pv2-shots.mjs';
export { names };
const read = file => readFileSync(`.art-work/s87/recordings/${file}`, 'utf8');
const demo = read('events.jsonl').trim().split('\n').map(JSON.parse).filter(r => r.event);
const biomes = JSON.parse(read('biomes.json'));
const manifest = JSON.parse(read('manifest.json'));
export const sessions = [...oldSessions, manifest];
const at = hook => demo.findIndex(r => r.event.hook === hook);
const pre = at('PreCompact'), post = at('PostCompact');
if (pre < 0 || post <= pre) throw Error('Actual compaction required');
const awake = demo.findLastIndex(r => r.event.hook === 'Notification');
const original = kind => previous.find(s => s.kind === kind);
const town = theme => biomes.find(b => b.theme === theme).town;
const D = (end, age = 0, theme = 'village') => ({ events: demo.slice(0, end + 1).map(({ event, at }) => ({ event, at })),
  id: demo[0].event.agent, anchor: demo[end].at, live: [], origin: [['s87/demo', end]], towns: [town(theme)], age });
const prayer = D(pre);
const bedroom = D(awake, 600100);
const spec = [
  [0, 1, 'hit', original('hit')], [1, 2, 'opening'],
  [2, 4, 'world', original('world')], [4, 6, 'town', original('town')],
  [6, 8, 'heroes', original('town')],
  [8, 9, 'biome', { state: D(2, 0, 'village'), motion: 98000 }],
  [9, 10, 'biome', { state: D(2, 0, 'port'), motion: 99000 }],
  [10, 11, 'biome', { state: D(2, 0, 'snow'), motion: 100000 }],
  [11, 12, 'biome', { state: D(2, 0, 'desert'), motion: 101000 }],
  [12, 13, 'biome', { state: D(2, 0, 'volcano'), motion: 102000 }],
  [13, 15, 'church', { state: prayer, motion: 103000, ageStart: 100, ageEnd: 2100 }],
  [15, 17, 'inn', { state: bedroom, motion: 105000, ageStart: 600100, ageEnd: 602100 }],
  [17, 17.5, 'hit', previous.find(s => s.number === 7)],
  [17.5, 19, 'test', original('test')], [19, 19.5, 'black'],
  [19.5, 21, 'level', original('level')], [21, 23, 'beyond'],
  [23, 24, 'back', original('back')], [24, 25, 'reveal', original('reveal')],
  [25, 27, 'party', original('party')], [27, 28, 'dragon', original('dragon')],
  [28, 29, 'hands', original('hands')], [29, 30, 'hero-hit', original('hero-hit')],
  [30, 31, 'party-hit', original('party-hit')], [31, 32, 'dragon-hit', original('dragon-hit')],
  [32, 33, 'return', original('return')], [33, 35, 'title'], [35, 39, 'cta'],
];
export const shots = spec.map(([start, end, kind, old = {}], i) => ({ ...old, number: i + 1, kind, start,
  seconds: end - start, startBeat: start * 3, endBeat: end * 3, motion: old.motion ?? 170000,
  ageStart: old.ageStart ?? 0, ageEnd: old.ageEnd ?? Math.min((end - start) * 1000, 2000) }));
export const contactTimes = [0.5, 29.5, 30.5, 31.5];
export const duration = 39;
if (shots.reduce((n, s) => n + s.seconds * 30, 0) !== 1170) throw Error('1170 frames required');
