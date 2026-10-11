// S8.7 live demo only. One Claude, isolated auth/home/repo; no worker/subagent launches.
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import WebSocket from 'ws';
import { redact } from './redact.mjs';
const root = mkdtempSync('/tmp/agent-quest-s87-'), port = 8867;
const repo = `${root}/quiet-quest`, home = `${root}/home`, auth = `${root}/claude`;
for (const dir of [repo, home, auth]) mkdirSync(dir);
writeFileSync(`${repo}/README.md`, '# Quiet Quest\nA harmless trailer recording repository.\n');
execFileSync('git', ['init', '-q', repo]);
copyFileSync(`${process.env.HOME}/.claude/.credentials.json`, `${auth}/.credentials.json`);
const token = randomBytes(24).toString('hex'), url = `http://127.0.0.1:${port}/?token=${token}`;
const server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/server/relay.ts', '--port', String(port), '--no-open'], {
  detached: true, env: { ...process.env, NODE_ENV: 'development', PORT: String(port), AGENT_CHARACTER_TOKEN: token,
    AGENT_CHARACTER_HOME: home, CLAUDE_CONFIG_DIR: auth }, stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '', socket, pty, session, terminal = '';
server.stdout.on('data', c => log += c); server.stderr.on('data', c => log += c);
const output = '.art-work/s87/recordings'; mkdirSync(output, { recursive: true });
const safe = value => redact(JSON.parse(JSON.stringify(value).replaceAll(root, '/demo').replaceAll('/private' + root, '/demo')));
const api = async (path, method = 'GET', body) => {
  const r = await fetch(new URL(path + '?token=' + token, url), { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  if (!r.ok) throw Error(`${path}: ${r.status} ${await r.text()}`); return r.status === 204 ? null : r.json();
};
try {
  for (let i = 0; !log.includes('Open ') && i < 150; i++) await new Promise(r => setTimeout(r, 100));
  if (!log.includes(`Open http://127.0.0.1:${port}/`)) throw Error('Demo port occupied/startup failed');
  writeFileSync(`${root}/control.json`, JSON.stringify({ url, pid: process.pid, repo }));
  console.log(`CONTROL=${root}/control.json`);
  writeFileSync(`${output}/events.jsonl`, '');
  socket = new WebSocket(url.replace('http:', 'ws:').replace('/?token=', '/ws?token='), { origin: new URL(url).origin });
  socket.on('message', raw => {
    const d = JSON.parse(String(raw)), rows = d.type === 'replay' ? d.events.map(x => ({ type: 'event', ...x })) : [d];
    for (const row of rows) if (['event', 'towns', 'names'].includes(row.type))
      appendFileSync(`${output}/events.jsonl`, JSON.stringify(safe({ recordedAt: Date.now(), ...row })) + '\n');
  });
  await once(socket, 'open');
  session = await api('/api/sessions', 'POST', { preset: 'claude', cwd: repo, weapon: 'steel' });
  writeFileSync(`${root}/session.json`, JSON.stringify(session));
  writeFileSync(`${output}/manifest.json`, JSON.stringify(safe(session), null, 2));
  pty = new WebSocket(url.replace('http:', 'ws:').replace('/?token=', `/pty?session=${session.id}&cols=110&rows=32&token=`), { origin: new URL(url).origin });
  pty.on('message', raw => { terminal += String(raw); writeFileSync(`${root}/terminal.txt`, terminal); });
  await once(pty, 'open');
  await new Promise(resolve => { for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, resolve); });
} finally {
  if (session) {
    try { await api(`/api/sessions/${session.id}/action`, 'POST', { action: 'farewell' }); } catch {}
    for (let i = 0; i < 70; i++) { const rows = await api('/api/sessions'); if (!rows.length) break; await new Promise(r => setTimeout(r, 100)); }
    writeFileSync(`${output}/cleanup.json`, JSON.stringify({ sessions: await api('/api/sessions'), port, rootRemoved: true }, null, 2));
  }
  const clean = terminal.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-9;?><:]*[a-zA-Z~]/g, '').replace(/\x1b[78]/g, '');
  writeFileSync(`${output}/terminal.jsonl`, JSON.stringify(safe({ at: Date.now(), data: clean })) + '\n');
  socket?.close(); pty?.close();
  if (server.exitCode === null) { const exit = once(server, 'exit'); process.kill(-server.pid, 'SIGTERM'); await exit; }
  rmSync(root, { recursive: true, force: true });
}
