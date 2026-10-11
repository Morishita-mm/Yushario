// Observe the real 10-minute dozing rule without changing clocks or generating events.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const [page] = process.argv.slice(2), root = '.art-work/s87/recordings';
const cli = (...args) => { const r = JSON.parse(execFileSync('orca', [...args, '--json'], { encoding: 'utf8', maxBuffer: 30e6 })); if (!r.ok) throw Error(JSON.stringify(r.error)); return r.result; };
const ev = expression => cli('eval', '--page', page, '--expression', expression).result;
let last, observedAt;
for (let i = 0; i < 180; i++) {
  last = readFileSync(`${root}/events.jsonl`, 'utf8').trim().split('\n').map(JSON.parse).filter(r => r.event).at(-1);
  observedAt = Date.now(); if (observedAt - last.at >= 600100) break;
  await new Promise(r => setTimeout(r, 1000));
}
if (observedAt - last.at < 600100) throw Error('Real inactivity not reached');
ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='ちいさく').click()`);
for (let i = 0; i < 30; i++) {
  if (ev(`!!document.querySelector('.compact-hero')`) === 'true') break;
  await new Promise(r => setTimeout(r, 100));
}
ev(`document.querySelector('.compact-hero').click()`);
cli('snapshot', '--page', page);
ev(`[...document.querySelectorAll('#town-layer button')].find(b=>b.textContent.trim()==='ついていく').click()`);
await new Promise(r => setTimeout(r, 800));
const snapshot = cli('snapshot', '--page', page);
if (!snapshot.snapshot.includes('quiet-quest: inn')) throw Error('Actual app did not put sleeper in inn');
const png = ev(`document.querySelector('#world').toDataURL('image/png').split(',')[1]`);
writeFileSync(`${root}/inn-live.png`, Buffer.from(png, 'base64'));
writeFileSync(`${root}/dozing.json`, JSON.stringify({ observedAt, lastEventAt: last.at, inactiveMs: observedAt - last.at,
  sourceEvent: last.event, snapshot: snapshot.snapshot, clockChanged: false }, null, 2) + '\n');
console.log('Genuine live dozing→inn observed after', observedAt - last.at, 'ms inactivity.');
