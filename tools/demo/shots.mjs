// Fixed editorial decisions for the approved S8.1 storyboard; no invented events.
import { readFileSync } from 'node:fs';
export const rows = (name) => readFileSync(new URL(`recordings-v2/${name}.jsonl`, import.meta.url), 'utf8').trim().split('\n').map(JSON.parse);
export const main = rows('main');
export const towns = [1, 2, 3].map((i) => rows(`town-${i}`));
export const sessions = JSON.parse(readFileSync(new URL('recordings-v2/manifest.json', import.meta.url))).sessions;
export const demoCaptions = [
  [0, 'まず、ローカルで起動。', 'Start locally.', 'startup'],
  [6000, '勇者を出す。初回はターミナルで設定。', 'Send a hero. First time? Set up the terminal.', 'launch'],
  [17000, 'いつもの言葉で、仕事を頼む。', 'Give your agent a task in plain language.', 'request'],
  [25000, '本物の作業が、冒険に見える。', 'Real work becomes an adventure.', 'work'],
  [35000, '呼ばれたら、内容を見て、その場で答える。', 'When called, review the action and answer here.', 'permission'],
  [46000, '直したコードが、戦果になる。', 'Real edits become victories.', 'edits'],
  [58000, 'テストの結果も、ひと目で。', 'See the test result at a glance.', 'test'],
  [65000, '仕事が終わったら、報告を受け取る。', 'Receive the report when the work is done.', 'report'],
  [74000, 'AIの仕事を、見える冒険に。', 'Turn AI work into a visible adventure.', 'ending'],
];
export const promoCaptions = [
  [0, 'AIの仕事が、冒険になる。', 'AI work becomes an adventure.', 'town'],
  [5000, '仲間と、挑む。', 'Take it on together.', 'party'],
  [10000, '呼ばれたら、答える。', 'When called, answer.', 'permission'],
  [14000, 'AGENT QUEST', 'AGENT QUEST', 'ending'],
];
const cues = new Map([[0, 12000], [1, 19000], [2, 25000], [3, 25100], [4, 27700], [5, 29500],
  [20, 30300], [21, 30400], [34, 35000], [35, 36000], [36, 36000], [37, 37000], [38, 43700], [39, 44000],
  [70, 58000], [71, 59500], [72, 59500], [73, 60000], [74, 61500], [75, 62000], [76, 65000], [77, 66000]]);
for (let i = 6; i <= 19; i++) cues.set(i, 29600 + (i - 6) * 50);
for (let i = 22; i <= 33; i++) cues.set(i, 30500 + (i - 22) * 350);
for (let group = 0; group < 5; group++) for (let n = 0; n < 6; n++)
  cues.set(40 + group * 6 + n, 46000 + group * 2000 + [0, 1000, 1000, 1300, 1600, 1700][n]);
export const demoTimeline = [...cues].sort((a, b) => a[1] - b[1]).map(([index, atMs]) => ({ index, atMs, row: main[index] }));
export const demoStills = new Map([[2000, '01-startup'], [8500, '02-launch'], [14500, '03-setup'], [20500, '04-request'],
  [26300, '05-dragon'], [28000, '05b-critical'], [32500, '06-lv2'], [40500, '07-permission'], [44300, '08-answer'],
  [46500, '08b-slime'], [56300, '09-lv3'], [58800, '09b-golem'], [63300, '10-tests'], [68500, '11-report'], [77000, '12-ending']]);
export const promoStills = new Map([[1000, '01-town'], [2300, '02-critical'], [6300, '03-dragon'],
  [9300, '04-level'], [11500, '05-permission'], [16000, '06-ending']]);
export function prefix(source, end, now) {
  return source.slice(0, end + 1).filter((row) => row.event && row.event.hook !== 'SessionEnd')
    .map((row, i, list) => ({ event: row.event, at: now - (list.length - i) * 10 }));
}
