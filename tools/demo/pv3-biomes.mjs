// Record genuine theme changes through the app's town-look UI, on our live demo page.
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
const [controlFile, page] = process.argv.slice(2), { url } = JSON.parse(readFileSync(controlFile, 'utf8'));
const cli = (...args) => { const r = JSON.parse(execFileSync('orca', [...args, '--json'], { encoding: 'utf8', maxBuffer: 30e6 })); if (!r.ok) throw Error(JSON.stringify(r.error)); return r.result; };
const ev = expression => cli('eval', '--page', page, '--expression', expression).result;
const output = '.art-work/s87/recordings'; mkdirSync(output, { recursive: true }); const proof = [];
for (const [theme, label] of [['village', '草原の村'], ['port', '海辺の港町'], ['snow', '雪国の町'], ['desert', '砂漠のオアシス'], ['volcano', '火山の町']]) {
  if (ev(`!![...document.querySelectorAll('#town-layer button')].find(b=>b.textContent.trim()===${JSON.stringify(label)})`) !== 'true') ev(`document.querySelector('#town-look').click()`);
  const before = cli('snapshot', '--page', page);
  ev(`[...document.querySelectorAll('#town-layer button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}).click()`);
  let towns;
  for (let i = 0; i < 60; i++) {
    towns = await fetch(new URL('/api/towns' + new URL(url).search, url)).then(r => r.json());
    if (towns.find(t => t.name === 'quiet-quest')?.theme === theme) break;
    await new Promise(r => setTimeout(r, 100));
  }
  if (towns.find(t => t.name === 'quiet-quest')?.theme !== theme) throw Error('Theme did not persist');
  await new Promise(r => setTimeout(r, 600));
  const after = cli('snapshot', '--page', page);
  const png = ev(`document.querySelector('#world').toDataURL('image/png').split(',')[1]`);
  writeFileSync(`${output}/town-${theme}.png`, Buffer.from(png, 'base64'));
  proof.push({ theme, label, recordedAt: Date.now(), before: before.snapshot, after: after.snapshot,
    town: { ...towns.find(t => t.name === 'quiet-quest'), path: '/demo/quiet-quest' } });
  console.log(theme, 'persisted through real UI');
}
writeFileSync(`${output}/biomes.json`, JSON.stringify(proof, null, 2) + '\n');
