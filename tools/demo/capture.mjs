// S8.1 camera: existing headless Chrome, one owned Target, genuine record replay only.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { connect, pause } from './cdp.mjs';
import { main, towns, sessions, prefix, demoTimeline, demoCaptions, promoCaptions, demoStills, promoStills, shotMotion } from './shots.mjs';
import { terminalExcerpts, demoTerminal, excerpt } from './terminal-excerpts.mjs';
import { stage, renderStage } from './stage.mjs';
const [url, output, kind, language, ratio, flag] = process.argv.slice(2);
if (!url || !output || !['demo', 'promo'].includes(kind) || !['ja', 'en'].includes(language)
  || !['16x9', '1x1'].includes(ratio) || (kind === 'demo' && ratio !== '16x9'))
  throw new Error('Usage: node tools/demo/capture.mjs <app-url> <output-dir> <demo|promo> <ja|en> <16x9|1x1> [--stills-only]');
const name = `${kind}-${language}-${ratio}`, duration = kind === 'demo' ? 80000 : 18000;
const stillsOnly = flag === '--stills-only';
const stills = kind === 'demo' ? demoStills : promoStills;
const captions = kind === 'demo' ? demoCaptions : promoCaptions;
const path = join(output, 'stills', name);mkdirSync(path, { recursive: true });
const target = await fetch(`http://127.0.0.1:9333/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' }).then((r) => r.json());
const cdp = await connect(target);
let encoder, cursor = 0, clockOffset = 0;
const trace = [], proof = [], pending = new Set();
const mainId = main[0].event.agent;
async function deliver(row, originIndex, atMs) {
  trace.push({ atMs, originFile: 'recordings-v2/main.jsonl', originIndex });
  if (row.type === 'permission') pending.add(row.id);
  if (row.type === 'permission-resolved') {
    // Replay the already-recorded human answer: no real command or HTTP permission hook exists.
    await cdp.evaluate(`(()=>{const b=[...document.querySelectorAll('.permission button')].find(b=>b.textContent.includes('はい'));b?.click();})()`);
    pending.delete(row.id);
  }
  const packet = row.event ? { type: 'event', event: { ...row.event, ts: 1800000000000 + atMs + clockOffset }, at: 1800000000000 + atMs + clockOffset } : row;
  await cdp.evaluate(`__deliver(${JSON.stringify(packet)})`);
  if (kind === 'demo' && originIndex === 1) await cdp.evaluate(`document.querySelector('#talk-input').value=''`);
  if (row.event?.hook === 'PostToolUse' && !row.event.subagent && ['Edit', 'Bash'].includes(row.event.tool)) {
    await settle();await pick();
  }
}
async function reset(recordings, end, ms) {
  for (const id of pending) await cdp.evaluate(`__deliver({type:'permission-resolved',id:${JSON.stringify(id)}})`);
  pending.clear();
  // Advance the app's genuine HUD update clock at each editorial cut, never its wins/level.
  clockOffset += 400;
  for (const source of recordings) trace.push({ atMs: ms, cut: true,
    originFile: `recordings-v2/${source === main ? 'main' : `town-${towns.indexOf(source) + 1}`}.jsonl`,
    originRange: [0, Math.min(end, source.length - 1)], orderedOriginalEventsOnly: true });
  const events = recordings.flatMap((source) => prefix(source, end, 1800000000000 + ms + clockOffset));
  await cdp.evaluate(`__movieMs=${ms};__clockOffset=${clockOffset};document.querySelector('#world-back').click();__deliver({type:'replay',events:${JSON.stringify(events)}});document.querySelector('#following-stop').click();`);
  await settle();
}
async function settle() {
  await cdp.evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
}
async function pick(id = mainId, follow = true) { await cdp.evaluate(`__pick(${JSON.stringify(id)},${follow})`); }
async function demoAction(ms) {
  if (ms === 8000) await cdp.evaluate(`document.querySelector('#expedition').click()`);
  if (ms === 8500) await cdp.evaluate(`document.querySelector('#expedition-weapon').value='legend';document.querySelector('#expedition-destination').value='/demo/tiny-quest'`);
  if (ms === 11000) await cdp.evaluate(`document.querySelector('#expedition-close').click()`);
  if (ms === 12500) await pick(mainId, false);
  if (ms === 17000) await cdp.evaluate(`document.querySelector('.compact-hero').click();__menu('はなす');document.querySelector('#talk-input').value=${JSON.stringify(main[1].event.text.split('Explore')[0])};`);
  if (ms === 23000) { await cdp.evaluate(`document.querySelector('#talk-close').click()`); await pick(); }
  if (ms === 65500) await cdp.evaluate(`document.querySelector('.compact-hero').click();__menu('はなす')`);
  if (ms === 66500) await cdp.evaluate(`document.querySelector('#talk-next').click();const card=document.querySelector('.report-card.chest');if(card){const h=document.querySelector('#talk-history');h.scrollTop+=card.getBoundingClientRect().top-h.getBoundingClientRect().top;}`);
  if (ms === 74000) await cdp.evaluate(`document.querySelector('#talk-close').click()`);
}
async function promoAction(ms) {
  if (ms === 0) { await cdp.evaluate('__motion=43400'); await reset(towns, 6, ms); await pick(towns[0][0].event.agent, false); }
  if (ms === 2000) { await reset([main], 38, ms); await deliver(main[39], 39, ms); }
  if (ms === 5000) { await reset([main], 3, ms); await pick(); }
  if (ms === 5600) await deliver(main[4], 4, ms);
  if (ms === 8000) { await reset([main], 68, ms); await pick(mainId, false); }
  if (ms === 8800) await deliver(main[69], 69, ms);
  if (ms === 10000) { await reset([main], 35, ms); await deliver(main[36], 36, ms); await settle(); await pick(mainId, false); }
  if (ms === 11000) await deliver(main[37], 37, ms);
  if (ms === 12900) { await deliver(main[38], 38, ms); await deliver(main[39], 39, ms); }
  if (ms === 14000) { await reset([main], 77, ms); await pick(mainId, false); }
}
try {
  const dimensions = await stage(cdp, url, kind, language, ratio, sessions);
  const snapshots = await terminalExcerpts(cdp);
  if (!stillsOnly) {
    encoder = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', '10', '-i', 'pipe:0',
      '-vf', 'fps=30', '-c:v', 'libx264', '-threads', '4', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(output, `${name}.mp4`)], { stdio: ['pipe', 'ignore', 'inherit'] });
    encoder.stdin.on('error', () => undefined);
  }
  for (let frame = 0; frame < duration / 100; frame++) {
    const ms = frame * 100;
    const motion = shotMotion(kind, ms);
    await cdp.evaluate(`__movieMs=${ms};__motion=${motion};`);
    if (kind === 'demo') {
      while (cursor < demoTimeline.length && demoTimeline[cursor].atMs <= ms) {
        const entry = demoTimeline[cursor++];await deliver(entry.row, entry.index, ms);
        await settle();
      }
      await demoAction(ms);
    } else await promoAction(ms);
    const permission = kind === 'demo' ? (ms >= 36000 && ms < 44000) || (ms >= 59500 && ms < 62000) : ms >= 10000 && ms < 12900;
    const ending = kind === 'demo' ? ms >= 74000 || ms < 6000 : ms >= 14000;
    const insert = kind === 'promo' && ((ms >= 3000 && ms < 3500) || (ms >= 5600 && ms < 6100)
      || (ms >= 12000 && ms < 12500));
    let terminal = demoTerminal(snapshots, ms);
    if (kind === 'promo') terminal = ms < 5000 ? excerpt(snapshots['39'], 'return coins', 12)
      : ms < 8000 ? excerpt(snapshots['2'], 'Explore', 12)
      : ms < 12900 ? excerpt(snapshots['36'], 'Edit file', 18)
      : ms < 14000 ? excerpt(snapshots['39'], 'return coins', 12) : excerpt(snapshots.final, 'Bash(npm test', 18);
    if (permission) await cdp.evaluate(`(()=>{const yes=[...document.querySelectorAll('.permission button')].find(b=>b.textContent.includes('はい'));if(yes&&__movieMs>=${kind === 'demo' ? 43000 : 12500})yes.focus();})()`);
    if (stillsOnly && !stills.has(ms)) continue;
    await renderStage(cdp, ms, captions.findLast((item) => item[0] <= ms), language, kind, ratio, terminal, permission, ending, insert);
    // Give the live HUD its 250ms update tick without aging a genuine success beyond the hit window.
    if (stills.has(ms)) { await pause(40); await settle(); }
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const png = Buffer.from(screenshot.data, 'base64');
    if (encoder && !encoder.stdin.write(png)) await once(encoder.stdin, 'drain');
    if (stills.has(ms)) {
      writeFileSync(join(path, `${stills.get(ms)}.png`), png);
      const visible = await cdp.evaluate(`({place:document.querySelector('#place-name').textContent,canvas:[world.width/2,world.height/2],css:[world.clientWidth,world.clientHeight],levels:[...document.querySelectorAll('.compact-hero')].map(x=>x.innerText),permission:document.querySelector('.permission')?.innerText,report:document.querySelector('.report-card.chest')?.innerText,levelNotice:document.querySelector('#movie-level').hidden?'':document.querySelector('#movie-level').textContent,caption:document.querySelector('#movie-caption').innerText,terminal:document.querySelector('#movie-terminal pre').innerText,canvasLabel:world.getAttribute('aria-label'),animationMs:__motion})`);
      proof.push({ ms, scene: stills.get(ms), terminalSource: terminal, ...visible });
      console.log(`${name} ${(ms / 1000).toFixed(1)}s ${stills.get(ms)} ${visible.place}`);
    }
  }
  if (encoder) {
    const exited = once(encoder, 'exit');encoder.stdin.end();const [code] = await exited;
    if (code !== 0) throw new Error(`ffmpeg exited ${code}`);
  }
  writeFileSync(join(output, `${name}.proof.json`), JSON.stringify({ name, ...dimensions, durationMs: duration,
    note: 'Genuine record packets replayed through the app WS message interface in this Target. Read-only session metadata; PTY and mutations disabled. Terminal text is cropped original xterm-decoded ANSI or the actual expanded final snapshot.',
    trace, scenes: proof }, null, 2) + '\n');
} finally {
  if (encoder && encoder.exitCode === null) { encoder.stdin.destroy();encoder.kill('SIGTERM'); }
  cdp.close();await fetch(`http://127.0.0.1:9333/json/close/${target.id}`);
}
