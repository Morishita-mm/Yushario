// Explicit approval only: one real Claude PTY and exactly one read-only Explore helper.
// Separate from record-party: never replaces the Japanese or party fixtures.
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
const output = process.argv[2];
if (!output || existsSync(output)) throw Error('Usage: record-report-en <new-evidence-directory>; explicit live-agent approval required');
const root = mkdtempSync('/tmp/yushario-report-en-'), port = 8879;
const repo = `${root}/tiny-quest`, home = `${root}/home`, auth = `${root}/claude`;
for (const dir of [repo, home, auth, `${repo}/.claude`, output]) mkdirSync(dir, { recursive: true });
const initial = {
  'README.md': '# Tiny Quest\nA tiny offline JavaScript project for demonstrating real coding tasks.\nreward adds a bonus to a coin reward. slots adds bag capacity. heal caps health at 100.\nUse npm test. No dependencies, network or commits.\n',
  'package.json': '{"private":true,"scripts":{"test":"node --test *.test.mjs"}}\n',
  'quest.mjs': 'export function reward(coins, bonus) { return coins - bonus; }\n',
  'pack.mjs': 'export function slots(items, extra) { return items - extra; }\n',
  'health.mjs': 'export function heal(hp, potion) { return Math.min(100, hp - potion); }\n',
};
for (const [file, fn, args, expected] of [['quest', 'reward', '4,2', 6], ['pack', 'slots', '3,2', 5], ['health', 'heal', '90,20', 100]])
  initial[`${file}.test.mjs`] = `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { ${fn} } from './${file}.mjs';\ntest('${fn}',()=>{assert.equal(${fn}(${args}),${expected});});\n`;
const prompt = 'Working only inside this demo folder, fix three small bugs and make the tests pass. Call exactly one Explore agent to inspect quest.mjs, pack.mjs, health.mjs and their three .test.mjs files read-only. Change the subtraction to addition in the three functions, and add one test to each test file: reward and slots with zero extra, and heal with the 100 cap. Finally run npm test once and check the result. No network, commits, other folders, or extra subagents. Report briefly in English.';
for (const [name, data] of Object.entries(initial)) writeFileSync(`${repo}/${name}`, data);
writeFileSync(`${home}/settings.json`, JSON.stringify({ archiveAfterDays: 30, sound: 'off', language: 'en' }));
writeFileSync(`${repo}/.claude/CLAUDE.md`, 'Recording safety: call the single Explore helper synchronously (run_in_background=false). Its prompt must explicitly require the Read tool for the six named files, never Bash, even for listing files. No extra helpers. Do not issue a progress-only final response before completing the requested fixes and test.\n');
// The helper cannot edit, run commands, access the network, or create more helpers.
writeFileSync(`${repo}/.claude/read-only.cjs`, `let input='';process.stdin.on('data',s=>input+=s);process.stdin.on('end',()=>{const x=JSON.parse(input);if(x.agent_id&&!['Read','Glob','Grep','SubagentHandback','ToolSearch'].includes(x.tool_name))console.log(JSON.stringify({hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:'Demo helper is read-only'}}));});\n`);
writeFileSync(`${repo}/.claude/settings.json`, JSON.stringify({ permissions: {
  allow: ['Read', 'Glob', 'Grep', 'Edit', 'Agent', 'Bash(npm test)'], deny: ['WebFetch', 'WebSearch', 'NotebookEdit'],
}, hooks: { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: `node '${repo}/.claude/read-only.cjs'` }] }] } }));
execFileSync('git', ['init', '-q', repo]);
// Authentication is copied privately; original credentials/settings/history are never written.
copyFileSync(`${process.env.HOME}/.claude/.credentials.json`, `${auth}/.credentials.json`);
writeFileSync(`${auth}/.claude.json`, JSON.stringify({ hasCompletedOnboarding: true, theme: 'dark',
  projects: { [repo]: { hasTrustDialogAccepted: true }, ['/private' + repo]: { hasTrustDialogAccepted: true } } }), { mode: 0o600 });
const token = randomBytes(24).toString('hex'), url = `http://127.0.0.1:${port}/?token=${token}`;
const server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/server/relay.ts', '--port', String(port), '--no-open'], {
  detached: true, env: { ...process.env, NODE_ENV: 'development', PORT: String(port), AGENT_CHARACTER_TOKEN: token,
    AGENT_CHARACTER_HOME: home, CLAUDE_CONFIG_DIR: auth, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '', socket, pty, session, terminal = '', complete = false, interrupted = false, cleaning = false;
const events = [], lifecycle = [], children = new Set();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { interrupted = true; });
server.stdout.on('data', c => log += c); server.stderr.on('data', c => log += c);
const pause = async ms => { await new Promise(r => setTimeout(r, ms)); if (interrupted && !cleaning) throw Error('Recording interrupted'); };
const api = async (path, method = 'GET', body) => {
  const response = await fetch(new URL(path + '?token=' + token, url), { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  if (!response.ok) throw Error(`${path}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
};
const descendants = () => {
  const rows = execFileSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8' }).trim().split('\n').map(s => s.trim().split(/\s+/).map(Number));
  const tree = new Set([server.pid]);
  for (const parent of tree) for (const [pid, ppid] of rows) if (ppid === parent) tree.add(pid);
  for (const pid of tree) children.add(pid);
};
const ids = new Map();
const safe = value => {
  if (Array.isArray(value)) return value.map(safe);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    if (['id', 'agent', 'terminal', 'sessionId'].includes(key) && typeof entry === 'string') {
      if (!ids.has(entry)) ids.set(entry, `demo-report-en-${ids.size + 1}`);
      return [key, ids.get(entry)];
    }
    return [key, safe(entry)];
  }));
  if (typeof value !== 'string') return value;
  let text = value.replaceAll('/private' + root, '/demo').replaceAll(root, '/demo')
    .replaceAll(/\/Users\/[^\s"'<>`]+|\/home\/[^\s"'<>`]+/g, '/demo/user')
    .replaceAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, 'demo@example.invalid');
  for (const [id, neutral] of ids) text = text.replaceAll(id, neutral);
  return text;
};
try {
  for (let i = 0; !log.includes('Open ') && i < 150; i++) await pause(100);
  if (!log.includes(`Open http://127.0.0.1:${port}/`)) throw Error('Recording port occupied/startup failed');
  socket = new WebSocket(new URL(`/ws?token=${token}`, url).href.replace('http:', 'ws:'), { origin: new URL(url).origin });
  socket.on('message', raw => {
    const data = JSON.parse(String(raw));
    if (data.type === 'event') { events.push({ recordedAt: Date.now(), ...data }); writeFileSync(`${root}/events.jsonl`, events.map(e => JSON.stringify(e)).join('\n') + '\n'); }
    if (data.type === 'permission') console.log('PERMISSION', JSON.stringify(safe(data)));
  });
  await once(socket, 'open');
  session = await api('/api/sessions', 'POST', { preset: 'claude', cwd: repo, weapon: 'legend' });
  pty = new WebSocket(new URL(`/pty?session=${session.id}&cols=120&rows=36&token=${token}`, url).href.replace('http:', 'ws:'), { origin: new URL(url).origin });
  pty.on('message', raw => { terminal += String(raw); writeFileSync(`${root}/terminal.txt`, terminal); });
  await once(pty, 'open');
  writeFileSync(`${root}/control.json`, JSON.stringify({ url, session, pid: process.pid }));
  console.log(`CONTROL=${root}/control.json`);
  let trusted = false;
  for (let i = 0; !events.some(r => r.event.hook === 'SessionStart') && i < 1800; i++) {
    const plain = terminal.replace(/\x1b\[[0-9;?><:]*[a-zA-Z~]/g, '');
    if (!trusted && plain.includes(repo) && plain.includes('trust') && plain.includes('No,exit')) {
      pty.send(JSON.stringify({ type: 'input', data: '\x1b[B' })); trusted = true;
      await pause(2000); pty.send(JSON.stringify({ type: 'input', data: '\r' }));
    }
    await pause(100);
  }
  assert.ok(events.some(r => r.event.hook === 'SessionStart'), 'Claude onboarding/trust needs explicit inspection');
  descendants(); await pause(1500);
  console.log('PROMPT', JSON.stringify(await api(`/api/sessions/${session.id}/say`, 'POST', { text: prompt })));
  const stoppedIds = () => new Set(events.filter(r => r.event.hook === 'SubagentStop' && r.event.subagent).map(r => r.event.subagent.id));
  const finished = () => stoppedIds().size === 1 && events.some(r => r.event.hook === 'PostToolUse' && r.event.tool === 'Bash') && events.at(-1)?.event.hook === 'Stop';
  for (let i = 0; !finished() && i < 900; i++) {
    await pause(1000); if (i % 10 === 0) descendants();
    if (i % 30 === 0) console.log(`Recording: ${events.length} events`);
  }
  assert.ok(finished(), 'Claude did not complete helper, tests and final Stop in 15 minutes');
  assert.deepEqual(events.filter(r => r.event.hook === 'SubagentStart').map(r => r.event.subagent.type), ['Explore']);
  assert.equal(stoppedIds().size, 1);
  assert.ok(events.filter(r => r.event.subagent && r.event.hook === 'PostToolUse').every(r => ['Read', 'Glob', 'Grep', 'SubagentHandback', 'ToolSearch'].includes(r.event.tool)), 'An executed helper tool was not read-only');
  assert.ok(!events.some(r => r.event.hook === 'PostToolUseFailure'));
  const transcripts = readdirSync(`${auth}/projects`, { recursive: true }).filter(f => f.endsWith('.jsonl') && !f.includes('/subagents/'));
  const transcript = transcripts.flatMap(file => readFileSync(`${auth}/projects/${file}`, 'utf8').trim().split('\n').map(JSON.parse));
  const tools = transcript.filter(row => row.type === 'assistant').flatMap(row => (row.message.content ?? []).filter(c => c.type === 'tool_use'));
  const calls = tools.filter(c => c.name === 'Agent');
  assert.equal(calls.length, 1); assert.equal(calls[0].input.subagent_type, 'Explore');
  const tests = tools.filter(c => c.name === 'Bash' && /\bnpm test\b/.test(c.input.command));
  assert.equal(tests.length, 1); assert.equal((tests[0].input.command.match(/\bnpm test\b/g) ?? []).length, 1);
  const result = transcript.flatMap(row => Array.isArray(row.message?.content) ? row.message.content : [])
    .find(c => c.type === 'tool_result' && c.tool_use_id === tests[0].id);
  assert.ok(result && !result.is_error); assert.match(JSON.stringify(result.content), /pass 6/);
  const edited = events.filter(r => !r.event.subagent && r.event.hook === 'PostToolUse' && ['Edit', 'Write'].includes(r.event.tool));
  assert.equal(new Set(edited.map(r => r.event.target)).size, 6, 'Need six actual file-tool events for a genuine chest');
  assert.equal(events.filter(r => !r.event.subagent && r.event.hook === 'PostToolUse' && r.event.tool === 'Bash' && r.event.target === 'npm test').length, 1,
    'Need a recognizable real test event, not a compound shell command');
  const reply = events.at(-1).event.text;
  assert.ok(reply && !/[ぁ-んァ-ヶ一-龯]/u.test(reply), 'Final reply is not English');
  writeFileSync(`${output}/initial-files.json`, JSON.stringify(initial, null, 2) + '\n');
  writeFileSync(`${output}/final-files.json`, JSON.stringify(Object.fromEntries(Object.keys(initial).map(f => [f, readFileSync(`${repo}/${f}`, 'utf8')])), null, 2) + '\n');
  writeFileSync(`${output}/main.jsonl`, events.map(e => JSON.stringify(safe(e))).join('\n') + '\n');
  writeFileSync(`${output}/manifest.json`, JSON.stringify({ sessions: [safe(session)], claudeVersion: execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim(), prompt,
    helpers: calls.map(c => ({ type: c.input.subagent_type, prompt: safe(c.input.prompt) })), reply,
    testEvidence: { command: safe(tests[0].input.command), output: safe(result.content), isError: result.is_error ?? false },
    allowedScope: 'One Claude, one read-only Explore; temporary Tiny Quest; three arithmetic fixes, three tests, one npm test',
    anonymization: 'Only temporary paths and session/subagent/terminal IDs replaced consistently; event text/results and receipt intervals unchanged' }, null, 2) + '\n');
  complete = true;
} finally {
  cleaning = true;
  if (session) {
    try { lifecycle.push({ farewell: await api(`/api/sessions/${session.id}/action`, 'POST', { action: 'farewell' }) }); } catch (error) { lifecycle.push({ error: error.message }); }
    for (let i = 0; i < 70; i++) { if (!(await api('/api/sessions')).length) break; await pause(100); }
    if ((await api('/api/sessions')).length) await api(`/api/sessions/${session.id}`, 'DELETE');
    lifecycle.push({ sessions: await api('/api/sessions') });
  }
  descendants(); socket?.close(); pty?.close();
  if (server.exitCode === null) { const exit = once(server, 'exit'); process.kill(-server.pid, 'SIGTERM'); await exit; }
  await pause(500);
  const alive = [...children].filter(pid => { try { process.kill(pid, 0); return true; } catch { return false; } });
  if (!complete) {
    writeFileSync(`${output}/failure-terminal.txt`, safe(terminal));
    writeFileSync(`${output}/failure-events.jsonl`, events.map(e => JSON.stringify(safe(e))).join('\n') + '\n');
  }
  rmSync(root, { recursive: true, force: true });
  writeFileSync(`${output}/cleanup.json`, JSON.stringify({ port, temporaryRoot: root, complete, lifecycle: safe(lifecycle), serverExited: server.exitCode !== null,
    remainingPids: alive, temporaryDataRemoved: !existsSync(root), userSettingsChanged: false }, null, 2) + '\n');
  assert.equal(alive.length, 0, 'Recording processes remain alive');
}
