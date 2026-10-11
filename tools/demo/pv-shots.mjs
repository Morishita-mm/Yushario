// Approved 24-second S8.5 montage. Original event contents never rewritten.
import { readFileSync } from 'node:fs';
const rows = (version, name) => readFileSync(new URL(`recordings-${version}/${name}.jsonl`, import.meta.url), 'utf8').trim().split('\n').map(JSON.parse);
export const main = rows('v2', 'main');
export const party = rows('v3', 'main');
export const pi = rows('v3', 'pi-1');
export const townPi = rows('v3', 'pi-2');
export const sessions = [...JSON.parse(readFileSync(new URL('recordings-v2/manifest.json', import.meta.url))).sessions,
  ...JSON.parse(readFileSync(new URL('recordings-v3/manifest.json', import.meta.url))).sessions];
export const events = (source, end) => source.slice(0, end + 1).filter(r => r.event && r.event.hook !== 'SessionEnd').map(r => ({ event: r.event, at: r.at }));
const thirdHelper = party.map((r, i) => [r, i]).filter(([r]) => r.event?.hook === 'SubagentStart')[2][1];
const piPre = pi.findIndex(r => r.event?.tool === 'Bash' && r.event?.hook === 'PreToolUse');
export const names = Object.fromEntries([[party[0].event.agent, 'Claude Code'], [main[0].event.agent, 'Claude Code'],
  [pi[0].event.agent, 'pi'], [townPi[0].event.agent, 'pi (2)']]);
export const shots = [
  { number: 1, start: 0, seconds: 3, motion: 43400, id: party[0].event.agent,
    events: [...events(party, 0), ...events(pi, pi.findIndex(r => r.event?.hook === 'Stop')), ...events(townPi, townPi.findIndex(r => r.event?.hook === 'Stop'))],
    origins: [['v3/main', 0], ['v3/pi-1', 4], ['v3/pi-2', 4]] },
  { number: 2, start: 3, seconds: 2, motion: 52400, id: party[0].event.agent, events: events(party, 1), origins: [['v3/main', 1]] },
  { number: 3, start: 5, seconds: 3, motion: 65700, id: party[0].event.agent, follow: true,
    events: events(party, thirdHelper), origins: [['v3/main', thirdHelper]] },
  { number: 4, start: 8, seconds: 3, motion: 90800, id: main[0].event.agent, follow: true,
    events: events(main, 38), live: main[39].event, origins: [['v2/main', 39]] },
  { number: 5, start: 11, seconds: 3, motion: 99800, id: pi[0].event.agent, follow: true,
    events: events(pi, piPre), origins: [['v3/pi-1', piPre]] },
  { number: 6, start: 14, seconds: 1, motion: 108800, id: main[0].event.agent, follow: true,
    events: events(main, 68), live: main[69].event, origins: [['v2/main', 69]] },
  { number: 7, start: 15, seconds: 4, motion: 124400, id: main[0].event.agent,
    events: events(main, 76), origins: [['v2/main', 76]] },
  { number: 8, start: 19, seconds: 5, motion: 136400, origins: [] },
];
