// Final silent-source schedule: one five-theme walking take and real unread report.
import { states, main, sessions, names } from './sources.mjs';
export { sessions, names };
const old = kind => states[kind];
const biography = old('biome').state;
const walk = { ...biography, events: biography.events.slice(0, 1), anchor: biography.events[0].at,
  origin: [['s87/demo', 0]], towns: biography.towns };
const chest = { events: main.slice(0, 77).filter(r => r.event).map(({ event, at }) => ({ event, at })),
  id: main[0].event.agent, anchor: main[76].at, live: [], origin: [['v2/main', 76]] };
const spec = [
  [0, 1, 'hit', old('hit')], [1, 2.5, 'opening'], [2.5, 4, 'world', old('world')],
  [4, 6, 'town', old('town')], [6, 8, 'heroes', old('heroes')],
  [8, 15.5, 'walk', { state: walk, motion: 1000000, ageStart: 0, ageEnd: 15500 }],
  [15.5, 17.5, 'church', old('church')], [17.5, 19.5, 'inn', old('inn')],
  [19.5, 20, 'hit', states.reprise],
  [20, 21.5, 'test', old('test')], [21.5, 22, 'black'], [22, 23.5, 'level', old('level')],
  [23.5, 31.5, 'treasure', { state: chest, motion: 3000000, ageStart: 0, ageEnd: 8000 }],
  [31.5, 33.5, 'back', old('back')], [33.5, 34.5, 'challenge', { ...old('back'), ageStart: 20, ageEnd: 40 }],
  [34.5, 35.5, 'reveal', { ...old('reveal'), ageStart: 40, ageEnd: 60 }],
  [35.5, 37.5, 'party', { ...old('party'), ageStart: 60, ageEnd: 80 }], [37.5, 38.5, 'dragon', old('dragon')],
  [38.5, 39.5, 'hands', old('hands')], [39.5, 40.5, 'hero-hit', old('hero-hit')],
  [40.5, 41.5, 'party-hit', old('party-hit')], [41.5, 42.5, 'dragon-hit', old('dragon-hit')],
  [42.5, 43.5, 'return', old('return')], [43.5, 45.5, 'title'], [45.5, 49.5, 'cta'],
];
export const shots = spec.map(([start, end, kind, previous = {}], i) => ({ ...previous, number: i + 1,
  start, seconds: end - start, kind, motion: previous.motion ?? 170000, ageStart: previous.ageStart ?? 0,
  ageEnd: previous.ageEnd ?? 0, startBeat: undefined, endBeat: undefined }));
export const duration = 49.5;
export const contactTimes = [0.5, 19.5, 40, 41, 42];
export const themes = ['village', 'port', 'snow', 'desert', 'volcano'];
export const cues = {
  version: 6, fps: 30, duration, audio: false, variants: ['ja-16x9', 'en-16x9', 'ja-1x1', 'en-1x1'],
  timeBasis: 'zero-based MP4 video PTS; end times exclusive; frame / 30 seconds',
  scenes: shots.flatMap(s => s.kind === 'walk' ? themes.map((theme, i) => ({ id: `S06-${theme}`,
    kind: 'biome-walk', theme, start: s.start + i * 1.5, end: s.start + (i + 1) * 1.5,
    startFrame: s.start * 30 + i * 45, endFrame: s.start * 30 + (i + 1) * 45,
    transition: i ? { kind: 'native theme change / continuous walk / fixed camera', start: s.start + i * 1.5,
      end: s.start + i * 1.5, frames: 0 } : null })) : s.kind === 'treasure' ? [
    { id: 'S13-received', kind: 'unread-chest-received', start: 23.5, end: 25.5, startFrame: 705, endFrame: 765 },
    { id: 'S13-open', kind: 'real-report-open-and-read', start: 25.5, end: 31.5, startFrame: 765, endFrame: 945 },
  ] : [{ id: `S${String(s.number).padStart(2, '0')}`, kind: s.kind, start: s.start,
    end: s.start + s.seconds, startFrame: s.start * 30, endFrame: (s.start + s.seconds) * 30 }]),
  effects: [
    ...contactTimes.map((time, i) => ({ id: `contact-${i + 1}`, kind: 'sword-contact', time, frame: time * 30,
      note: i === 1 ? 'Reprise of the opening real success, not another result.' : 'Existing application attack contact.' })),
    { id: 'level-up', kind: 'level-up', time: 22, frame: 660, note: 'Actual Lv2 to Lv3 DOM notice appears.' },
    { id: 'chest-received', kind: 'report-arrival', time: 23.5, frame: 705, note: 'Existing unread chest badge; real completed Stop report.' },
    { id: 'chest-open', kind: 'chest-open', time: 25.5, frame: 765, note: 'Actual unread map badge click opens the report dialog; no invented lid animation.' },
    { id: 'party-reveal', kind: 'party-reveal', time: 34.5, frame: 1035, note: 'Uninterrupted pullback from dragon to hero plus four professions; not a new subagent event.' },
    { id: 'title-flash', kind: 'flash', time: 43.5, frame: 1305, note: 'Single 3-frame editorial flash; dragon is not defeated.' },
    { id: 'title-enter', kind: 'title-jingle', time: 43.6, frame: 1308, note: 'Left-to-right pixel-aligned logo wipe starts after flash and completes at 44.7s; tagline appears at 46.6s (frame 1398, titleEase); not a victory cue.' },
  ].sort((a, b) => a.frame - b.frame),
};
if (shots.reduce((n, s) => n + s.seconds * 30, 0) !== duration * 30) throw Error('Non-integral frame schedule');
