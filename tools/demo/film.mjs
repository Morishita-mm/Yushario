// Isolated S8.1 filming. Uses the existing 9333 browser; never launches any CLI agent.
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
const root = fileURLToPath(new URL('../../', import.meta.url));
const [destination, ...options] = process.argv.slice(2);
const variants = ['demo-ja-16x9', 'demo-en-16x9', 'promo-ja-16x9', 'promo-en-16x9', 'promo-ja-1x1', 'promo-en-1x1'];
if (!destination || options.some((arg) => arg !== '--stills-only' && !variants.includes(arg)))
  throw new Error('Usage: node tools/demo/film.mjs <output-dir> [variant] [--stills-only]');
execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
await fetch('http://127.0.0.1:9333/json/version').then((response) => {
  if (!response.ok) throw new Error('Headless Chrome CDP 9333 unavailable; not starting another browser');
});
const output = resolve(destination), selected = options.filter((arg) => variants.includes(arg));
const home = mkdtempSync(join(tmpdir(), 'agent-quest-film-'));
const token = randomBytes(24).toString('hex');mkdirSync(output, { recursive: true });
writeFileSync(join(home, 'towns.json'), JSON.stringify(['tiny-quest', 'hero-town'].map((name) => ({
  name, path: `/demo/${name}`, firstSeenAt: Date.now(), lastActiveAt: Date.now(), pinned: false, theme: 'village',
}))));
const server = spawn(process.execPath, [join(root, 'node_modules/tsx/dist/cli.mjs'), 'src/server/relay.ts', '--port', '8805', '--no-open'], {
  cwd: root, detached: true, env: { ...process.env, PORT: '8805', NODE_ENV: 'development',
    AGENT_CHARACTER_TOKEN: token, AGENT_CHARACTER_HOME: home }, stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
server.stderr.on('data', (chunk) => { logs += chunk; });
try {
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server startup timeout: ${logs}`)), 15000);
    server.once('error', (error) => { clearTimeout(timeout);reject(error); });
    server.once('exit', (code) => { clearTimeout(timeout);reject(new Error(`Server exited ${code}: ${logs}`)); });
    server.stdout.on('data', (chunk) => {
      logs += chunk;
      const match = logs.match(/Open (http:\/\/127\.0\.0\.1:(\d+)\/\?token=\S+)/);
      if (!match) return;
      clearTimeout(timeout);
      if (match[2] !== '8805') reject(new Error('Port 8805 is occupied; refusing another port'));
      else resolve(match[1]);
    });
  });
  console.log('Isolated 8805 server; recorded packets only; no Claude/PTY');
  for (const variant of selected.length ? selected : variants) {
    const [kind, language, ratio] = variant.split('-');
    const camera = spawn(process.execPath, ['tools/demo/capture.mjs', url, output, kind, language, ratio,
      ...(options.includes('--stills-only') ? ['--stills-only'] : [])], { cwd: root, stdio: 'inherit' });
    const code = await new Promise((resolve, reject) => { camera.once('exit', resolve);camera.once('error', reject); });
    if (code !== 0) throw new Error(`Camera ${variant} exited ${code}`);
  }
} finally {
  if (server.exitCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve));
    process.kill(-server.pid, 'SIGTERM');await exited;
  }
  rmSync(home, { recursive: true, force: true });
}
