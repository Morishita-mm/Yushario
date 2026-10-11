// S8.5: Orca embedded browser only. No external browser, CLI agents, or terminal frames.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { boot, installCamera } from './pv-stage.mjs';
import { shots, sessions, names, pi } from './pv-shots.mjs';
const [destination, ...options] = process.argv.slice(2);
const variants = ['pv-ja-16x9', 'pv-en-16x9', 'pv-ja-1x1', 'pv-en-1x1'];
if (!destination || options.some(a => a !== '--stills-only' && !variants.includes(a)))
  throw Error('Usage: node tools/demo/pv-film.mjs <output-dir> [pv-ja-16x9|pv-en-16x9|pv-ja-1x1|pv-en-1x1] [--stills-only]');
const output = resolve(destination), home = mkdtempSync('/tmp/agent-quest-pv-');
mkdirSync(output, { recursive: true });
const token = randomBytes(24).toString('hex'), port = 8846;
const cli = (...args) => {
  const data = JSON.parse(execFileSync('orca', [...args, '--json'], { encoding: 'utf8', maxBuffer: 200 * 1024 * 1024 }));
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
    if (match) { if (+match[2] !== port) throw Error('8846 occupied; refusing another port'); url = match[1]; break; }
    if (server.exitCode !== null) throw Error(`Relay exited: ${log}`);
    await new Promise(r => setTimeout(r, 100));
  }
  if (!url) throw Error('PV relay startup timeout');
  page = cli('tab', 'create', '--url', new URL('/logo/title.png', url).href).browserPageId;
  const evaluate = expression => {
    const r = cli('eval', '--page', page, '--expression', expression).result;
    try { return JSON.parse(r); } catch { return r; }
  };
  const html = await fetch(url).then(r => r.text());
  const source = html.replace('<head>', `<head><base href="${url}">`);
  const init = `(${boot.toString()})(${JSON.stringify(url)},${JSON.stringify(sessions)})`;
  for (const variant of options.filter(a => variants.includes(a)).length ? options.filter(a => variants.includes(a)) : variants) {
    const [, language, ratio] = variant.split('-'), width = ratio === '1x1' ? 1080 : 1920;
    cli('exec', '--page', page, '--command', `set viewport ${width} 1080`);
    evaluate(`(${installCamera.toString()})(${JSON.stringify(source)},${JSON.stringify(init)},${width},${JSON.stringify(language)})`);
    evaluate(`document.querySelector('#pv-app').contentWindow.__pvDeliver({type:'names',names:${JSON.stringify(names)}})`);
    const stills = join(output, 'stills', variant); mkdirSync(stills, { recursive: true });
    const proof = [];
    if (!options.includes('--stills-only')) {
      encoder = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', '10', '-i', 'pipe:0',
        '-vf', 'fps=30', '-c:v', 'libx264', '-threads', '4', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
        '-an', '-movflags', '+faststart', join(output, `${variant}.mp4`)], { stdio: ['pipe', 'ignore', 'inherit'] });
      encoder.stdin.on('error', () => {});
    }
    for (const shot of shots) {
      if (shot.events) evaluate(`pv.shot(${JSON.stringify(shot.events)},${JSON.stringify(shot.id)},${!!shot.follow},${shot.motion})`);
      if (shot.live) evaluate(`pv.event(${JSON.stringify(shot.live)})`);
      const scene = { ...shot, receipt: evaluate('pv.receipt()') };
      delete scene.events; delete scene.live;
      if (shot.number === 7) {
        evaluate(`pv.report(${JSON.stringify(shot.id)})`);
        const png = Buffer.from(cli('screenshot', '--page', page).data, 'base64');
        writeFileSync(join(stills, 's7.png'), png);
        for (let i = 0; encoder && i < shot.seconds * 10; i++) if (!encoder.stdin.write(png)) await once(encoder.stdin, 'drain');
      } else {
        const total = options.includes('--stills-only') ? 1 : shot.seconds * 10;
        for (let i = 0; i < total; i += 5) {
          if (shot.number === 5 && i === 15) {
            const post = pi.find(r => r.event?.hook === 'PostToolUse' && r.event?.tool === 'Bash').event;
            evaluate(`pv.event(${JSON.stringify(post)})`); scene.receipt = evaluate('pv.receipt()') - 1500;
          }
          const frames = evaluate(`pv.frames(${JSON.stringify(scene)},${i},${Math.min(5, total - i)})`);
          for (let j = 0; j < frames.length; j++) {
            const png = Buffer.from(frames[j], 'base64');
            if (i + j === (options.includes('--stills-only') ? 0 : 10) || (shot.number === 6 && i + j === 4)) writeFileSync(join(stills, `s${shot.number}.png`), png);
            if (encoder && !encoder.stdin.write(png)) await once(encoder.stdin, 'drain');
          }
        }
      }
      proof.push({ number: shot.number, start: shot.start, seconds: shot.seconds, origins: shot.origins, ...evaluate('pv.proof()') });
      console.log(`${variant} S${shot.number} captured`);
    }
    if (encoder) { const exit = once(encoder, 'exit'); encoder.stdin.end(); const [code] = await exit; encoder = undefined; if (code) throw Error(`ffmpeg ${code}`); }
    writeFileSync(join(output, `${variant}.proof.json`), JSON.stringify({ variant, width, height: 1080, seconds: 24,
      fps: 30, capturedFps: 10, audio: false, note: 'Orca-owned iframe; real app canvas plus editorial titles. Actual report DOM screenshot. Original event contents/IDs/results intact; receipt/animation intervals edited; no PTY or writes.', scenes: proof }, null, 2) + '\n');
  }
} finally {
  if (encoder?.exitCode === null) { encoder.stdin.destroy(); encoder.kill('SIGTERM'); }
  try {
    if (page) {
      const tab = cli('tab', 'list').tabs.find(t => t.browserPageId === page);
      if (tab) cli('tab', 'close', '--index', String(tab.index));
    }
  } finally {
    if (server.exitCode === null) { const exit = once(server, 'exit'); process.kill(-server.pid, 'SIGTERM'); await exit; }
    rmSync(home, { recursive: true, force: true });
  }
}
