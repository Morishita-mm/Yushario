// Silent source; isolated relay/home and this worktree's embedded browser only.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { boot } from './boot.mjs';
import { cameraSource, extendCamera, enableTownWrites } from './stage.mjs';
import { shots, sessions, names, contactTimes, duration, cues } from './shots.mjs';
import { townSpecs } from './sources.mjs';
const [destination, ...options] = process.argv.slice(2);
const variants = ['source-ja-16x9', 'source-en-16x9', 'source-ja-1x1', 'source-en-1x1'];
if (!destination || options.some(a => a !== '--stills-only' && !variants.includes(a))) throw Error('Usage: film <output-dir> [variant] [--stills-only]');
const output = resolve(destination), home = mkdtempSync('/tmp/yushario-pv-');
mkdirSync(output, { recursive: true });
writeFileSync(join(output, 'cues.json'), JSON.stringify(cues, null, 2) + '\n');
const towns = townSpecs.map(([name, theme]) => {
  const path = join(home, 'projects', name); mkdirSync(path, { recursive: true });
  return { name, path, theme, pinned: false, firstSeenAt: 1800000000000, lastActiveAt: 1800000000000 };
});
writeFileSync(join(home, 'towns.json'), JSON.stringify(towns));
writeFileSync(join(output, 'presentation-map.json'), JSON.stringify({ towns, scenes: shots.filter(s => s.state).map(s => ({
  number: s.number, kind: s.kind, aliases: s.state.projectAliases, receiptShift: s.state.receiptShift,
  origin: s.state.origin, note: 'Only approved project aliases and receipt translations; IDs, hooks, text and results unchanged',
})) }, null, 2) + '\n');
const token = randomBytes(24).toString('hex'), port = 8878;
const executable = process.env.ORCA_CLI_COMMAND ?? (process.env.ORCA_DEV_REPO_ROOT ? 'orca-dev' : 'orca');
const cli = (...args) => {
  const data = JSON.parse(execFileSync(executable, [...args, '--json'], { encoding: 'utf8', maxBuffer: 200 * 1024 * 1024 }));
  if (!data.ok) throw Error(JSON.stringify(data.error)); return data.result;
};
const server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/server/relay.ts', '--port', String(port), '--no-open'], {
  detached: true, env: { ...process.env, NODE_ENV: 'development', PORT: String(port), AGENT_CHARACTER_TOKEN: token,
    AGENT_CHARACTER_HOME: home }, stdio: ['ignore', 'pipe', 'pipe'],
});
let page, encoder, log = '';
server.stdout.on('data', c => log += c); server.stderr.on('data', c => log += c);
try {
  let url;
  for (let i = 0; i < 150; i++) {
    const match = log.match(/Open (http:\/\/127\.0\.0\.1:(\d+)\/\?token=\S+)/);
    if (match) { if (+match[2] !== port) throw Error('8878 occupied; refusing another port'); url = match[1]; break; }
    if (server.exitCode !== null) throw Error('PV relay exited'); await new Promise(r => setTimeout(r, 100));
  }
  if (!url) throw Error('PV relay startup timeout');
  page = cli('tab', 'create', '--url', new URL('/logo/title.png', url).href).browserPageId;
  cli('snapshot', '--page', page);
  const evaluate = expression => {
    const r = cli('eval', '--page', page, '--expression', expression).result;
    try { return JSON.parse(r); } catch { return r; }
  };
  const source = (await fetch(url).then(r => r.text())).replace('<head>', `<head><base href="${url}">`);
  const init = `window.__pvOriginalFetch=fetch.bind(window);(${boot.toString()})(${JSON.stringify(url)},${JSON.stringify(sessions)},${JSON.stringify(towns)});(${enableTownWrites.toString()})(${JSON.stringify(url)})`;
  const selected = options.filter(a => variants.includes(a));
  for (const variant of selected.length ? selected : variants) {
    const [, language, ratio] = variant.split('-'), width = ratio === '1x1' ? 1080 : 1920;
    cli('exec', '--page', page, '--command', `set viewport ${width} 1080`);
    evaluate(`${cameraSource}(${JSON.stringify(source)},${JSON.stringify(init)},${width},${JSON.stringify(language)})`);
    evaluate(`(${extendCamera.toString()})(${width},${JSON.stringify(language)})`);
    evaluate(`document.querySelector('#pv2-app').contentWindow.__pvDeliver({type:'names',names:${JSON.stringify(names)}})`);
    const directory = join(output, 'stills', variant); mkdirSync(directory, { recursive: true }); const proof = [];
    if (!options.includes('--stills-only')) {
      encoder = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', '30', '-i', 'pipe:0',
        '-c:v', 'libx264', '-threads', '4', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
        '-an', '-movflags', '+faststart', join(output, `${variant}.mp4`)], { stdio: ['pipe', 'ignore', 'inherit'] });
      encoder.stdin.on('error', () => {});
    }
    for (const original of shots) {
      const shot = structuredClone(original);
      if (shot.state) shot.state.towns = towns.map(town => ({ ...town,
        theme: town.name === 'quiet-quest' && shot.kind !== 'world' ? 'village' : town.theme }));
      const before = evaluate(`pv2.prepare(${JSON.stringify(shot)})`);
      if (shot.kind === 'level') {
        const rect = evaluate('pv2.noticeArea()'), screenshot = cli('screenshot', '--page', page).data;
        evaluate(`pv2.setNotice(${JSON.stringify(screenshot)},${JSON.stringify(rect)})`);
      }
      const representative = shot.kind === 'reveal' ? 29 : shot.kind === 'test' ? 30 : shot.kind === 'title' ? 40 : Math.floor(shot.seconds * 15);
      const total = encoder ? shot.seconds * 30 : 1;
      for (let i = 0; i < total; i += 10) {
        const start = encoder ? i : representative;
        if (shot.kind === 'treasure' && (start === 60 || !encoder)) {
          evaluate('pv2.openTreasure()'); cli('snapshot', '--page', page);
          const screenshot = cli('screenshot', '--page', page).data;
          evaluate(`pv2.setTreasure(${JSON.stringify(screenshot)})`);
        }
        const frames = evaluate(`pv2.frames(${JSON.stringify(shot)},${start},${Math.min(10, total - i)})`);
        for (const [j, image] of frames.entries()) {
          const png = Buffer.from(image, 'base64');
          if (start + j === representative) writeFileSync(join(directory, `s${String(shot.number).padStart(2, '0')}.png`), png);
          if (encoder && !encoder.stdin.write(png)) await once(encoder.stdin, 'drain');
        }
      }
      proof.push({ number: shot.number, start: shot.start, seconds: shot.seconds, kind: shot.kind,
        origins: shot.state?.origin ?? [], sourceAge: [shot.ageStart, shot.ageEnd], before, after: evaluate('pv2.proof()') });
      console.log(`${variant} S${String(shot.number).padStart(2, '0')} captured`);
    }
    if (encoder) { const exit = once(encoder, 'exit'); encoder.stdin.end(); const [code] = await exit; encoder = undefined; if (code) throw Error(`ffmpeg ${code}`); }
    writeFileSync(join(output, `${variant}.proof.json`), JSON.stringify({ variant, width, height: 1080, seconds: duration,
      fps: 30, audio: false, contactTimes, scenes: proof, textChecks: evaluate('pv2.textChecks()'),
      note: 'Real app/core and original event packets; continuous natural Walker; actual theme UI/PATCH in temporary home; actual unread badge click/native report DOM screenshot; no new agents or invented results.' }, null, 2) + '\n');
  }
} finally {
  if (encoder?.exitCode === null) { encoder.stdin.destroy(); encoder.kill('SIGTERM'); }
  try {
    if (page) { const tab = cli('tab', 'list').tabs.find(t => t.browserPageId === page); if (tab) cli('tab', 'close', '--index', String(tab.index)); }
  } finally {
    if (server.exitCode === null) { const exit = once(server, 'exit'); process.kill(-server.pid, 'SIGTERM'); await exit; }
    rmSync(home, { recursive: true, force: true });
    writeFileSync(join(output, 'cleanup.json'), JSON.stringify({ port, serverExited: server.exitCode !== null,
      pageClosed: true, temporaryHomeRemoved: home, appCodeChanged: false, newAgentsStarted: 0 }, null, 2) + '\n');
  }
}
