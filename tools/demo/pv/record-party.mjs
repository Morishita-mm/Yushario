// Explicitly approved live fixture recording, not part of capture or the app.
// One isolated Claude PTY; four read-only helpers; no user settings are changed.
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
const root = mkdtempSync('/tmp/yushario-party-'), port = 8879;
const repo = `${root}/tiny-quest`, home = `${root}/home`, auth = `${root}/claude`;
const output = '.art-work/pv/party-recording';
for (const dir of [repo, home, auth, `${repo}/.claude/agents`, output]) mkdirSync(dir, { recursive: true });
const initial = {
  'README.md': '# Tiny Quest\nA tiny offline JavaScript project for demonstrating real coding tasks.\nreward adds a bonus to a coin reward. slots adds bag capacity. heal caps health at 100.\nUse npm test. No dependencies, network or commits.\n',
  'package.json': '{"private":true,"scripts":{"test":"node --test *.test.mjs"}}\n',
  'quest.mjs': 'export function reward(coins, bonus) { return coins - bonus; }\n',
  'pack.mjs': 'export function slots(items, extra) { return items - extra; }\n',
  'health.mjs': 'export function heal(hp, potion) { return Math.min(100, hp - potion); }\n',
};
for (const [file, fn, args, expected] of [['quest', 'reward', '4,2', 6], ['pack', 'slots', '3,2', 5], ['health', 'heal', '90,20', 100]])
  initial[`${file}.test.mjs`] = `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { ${fn} } from './${file}.mjs';\ntest('${fn}',()=>{assert.equal(${fn}(${args}),${expected});});\n`;
const custom = `---\nname: quest-mage\ndescription: Read-only reviewer of Tiny Quest boundary cases\ntools: Read, Glob, Grep\nmodel: inherit\n---\nRead only the Tiny Quest README and six JavaScript source/test files in the current folder. Check boundary cases and return a short Japanese summary. Never edit files, execute commands, use a network, inspect other folders, or create another agent.\n`;
const prompt = 'このデモ用フォルダ内だけで3つの小さなバグを修正してテストを通して。最初の応答でAgentツールをちょうど4回、同じ応答内の並列呼び出しとして同時に起動してください。subagent_typeはExplore・Plan・general-purpose・quest-mageを各1人です。Exploreはquest.mjsとテスト、Planはpack.mjsとテスト、general-purposeはhealth.mjsとテスト、quest-mageは3関数のゼロ追加と100上限の境界条件を担当します。4人ともREADME.mdと6つのmjsファイルをReadで読んでから短く日本語で報告してください。仲間は読み取り専用で、編集・コマンド実行・ネットワーク・他フォルダへのアクセス・追加のAgentは禁止です。4人の結果を受け取ってから本体だけが各関数の引き算を足し算へ直し、各テストファイルにゼロ追加か100上限のテストを1件追加してください。最後に本体だけでnpm testを1回実行し、短く日本語で報告してください。依存追加・コミット・他フォルダへのアクセス・5人目の仲間は禁止です。';
for (const [name, data] of Object.entries(initial)) writeFileSync(`${repo}/${name}`, data);
writeFileSync(`${repo}/.claude/agents/quest-mage.md`, custom);
// Defence in depth: built-in helpers also cannot write or run commands.
writeFileSync(`${repo}/.claude/read-only.cjs`, `let input='';process.stdin.on('data',s=>input+=s);process.stdin.on('end',()=>{const x=JSON.parse(input);if(x.agent_id&&!['Read','Glob','Grep','SubagentHandback','ToolSearch'].includes(x.tool_name))console.log(JSON.stringify({hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:'Demo helpers are read-only'}}));});\n`);
writeFileSync(`${repo}/.claude/settings.json`, JSON.stringify({ permissions: {
  allow: ['Read', 'Glob', 'Grep', 'Edit', 'Agent', 'Bash(npm test)'],
  deny: ['WebFetch', 'WebSearch', 'NotebookEdit'],
}, hooks: { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: `node '${repo}/.claude/read-only.cjs'` }] }] } }));
execFileSync('git', ['init', '-q', repo]);
// Only copy authentication into the throwaway config directory, never settings/history.
copyFileSync(`${process.env.HOME}/.claude/.credentials.json`, `${auth}/.credentials.json`);
writeFileSync(`${auth}/.claude.json`, JSON.stringify({ hasCompletedOnboarding: true, theme: 'dark',
  projects: { [repo]: { hasTrustDialogAccepted: true }, ['/private' + repo]: { hasTrustDialogAccepted: true } } }), { mode: 0o600 });
const token = randomBytes(24).toString('hex'), url = `http://127.0.0.1:${port}/?token=${token}`;
const server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/server/relay.ts', '--port', String(port), '--no-open'], {
  detached: true, env: { ...process.env, NODE_ENV: 'development', PORT: String(port), AGENT_CHARACTER_TOKEN: token,
    AGENT_CHARACTER_HOME: home, CLAUDE_CONFIG_DIR: auth, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '', socket, pty, session, terminal = '', complete = false;
const events = [], lifecycle = [], children = new Set();
let interrupted = false, cleaning = false;
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
// Stable neutral IDs in fixtures, never original session/subagent identifiers.
const ids = new Map();
const safe = value => {
  if (Array.isArray(value)) return value.map(safe);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    if (['id', 'agent', 'terminal', 'sessionId'].includes(key) && typeof entry === 'string') {
      if (!ids.has(entry)) ids.set(entry, `demo-party-${ids.size + 1}`);
      return [key, ids.get(entry)];
    }
    return [key, safe(entry)];
  }));
  if (typeof value !== 'string') return value;
  return value.replaceAll('/private' + root, '/demo').replaceAll(root, '/demo')
    .replaceAll(/\/Users\/[^\s"'<>`]+|\/home\/[^\s"'<>`]+/g, '/demo/user')
    .replaceAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, 'demo@example.invalid');
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
  // Trust only this newly created, reviewed fixture, on this exact application's PTY socket.
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
  const finished = () => stoppedIds().size === 4
    && events.some(r => r.event.hook === 'PostToolUse' && r.event.tool === 'Bash')
    && events.at(-1)?.event.hook === 'Stop';
  for (let i = 0; !finished() && i < 900; i++) {
    await pause(1000); if (i % 10 === 0) descendants();
    if (i % 30 === 0) console.log(`Recording: ${events.length} events`);
  }
  assert.ok(finished(), 'Claude did not complete all helpers, tests and final Stop in 15 minutes');
  const starts = events.filter(r => r.event.hook === 'SubagentStart');
  assert.deepEqual(starts.map(r => r.event.subagent.type).sort(), ['Explore', 'Plan', 'general-purpose', 'quest-mage'].sort());
  const stops = events.filter(r => r.event.hook === 'SubagentStop');
  assert.equal(stoppedIds().size, 4);
  assert.ok(Math.max(...starts.map(r => r.at)) < Math.min(...stops.map(r => r.at)), 'Four helpers did not overlap');
  assert.ok(events.filter(r => r.event.subagent && r.event.tool).every(r => ['Read', 'Glob', 'Grep', 'SubagentHandback', 'ToolSearch'].includes(r.event.tool)), 'Helper was not read-only');
  assert.ok(!events.some(r => r.event.hook === 'PostToolUseFailure'));
  // Keep the transcript only long enough to prove one parallel assistant response.
  const { readdirSync } = await import('node:fs');
  const transcripts = readdirSync(`${auth}/projects`, { recursive: true }).filter(f => f.endsWith('.jsonl') && !f.includes('/subagents/'));
  const transcript = transcripts.flatMap(file => readFileSync(`${auth}/projects/${file}`, 'utf8').trim().split('\n').map(JSON.parse));
  const tools = transcript.filter(row => row.type === 'assistant').flatMap(row => (row.message.content ?? [])
    .filter(c => c.type === 'tool_use').map(c => ({ ...c, response: row.message.id })));
  const calls = tools.filter(c => c.name === 'Agent').map(c => ({ response: c.response, type: c.input.subagent_type, prompt: c.input.prompt }));
  assert.equal(calls.length, 4); assert.equal(new Set(calls.map(c => c.response)).size, 1, 'Agent calls were not in one assistant response');
  // Adapter targets intentionally summarize a shell command's first words; inspect the actual demo tool call for compound commands.
  const tests = tools.filter(c => c.name === 'Bash' && /\bnpm test\b/.test(c.input.command));
  assert.equal(tests.length, 1); assert.equal((tests[0].input.command.match(/\bnpm test\b/g) ?? []).length, 1);
  const result = transcript.flatMap(row => Array.isArray(row.message?.content) ? row.message.content : [])
    .find(c => c.type === 'tool_result' && c.tool_use_id === tests[0].id);
  assert.ok(result && !result.is_error); assert.match(JSON.stringify(result.content), /pass 6/);
  const testEvidence = { command: safe(tests[0].input.command), output: safe(result.content), isError: result.is_error ?? false };
  writeFileSync(`${output}/initial-files.json`, JSON.stringify(initial, null, 2) + '\n');
  writeFileSync(`${output}/final-files.json`, JSON.stringify(Object.fromEntries(Object.keys(initial).map(f => [f, readFileSync(`${repo}/${f}`, 'utf8')])), null, 2) + '\n');
  writeFileSync(`${output}/main.jsonl`, events.map(e => JSON.stringify(safe(e))).join('\n') + '\n');
  writeFileSync(`${output}/manifest.json`, JSON.stringify({ sessions: [safe(session)], claudeVersion: execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim(),
    prompt, customAgent: custom, parallelResponse: true, testEvidence, helpers: calls.map(({ type, prompt }) => ({ type, prompt: safe(prompt) })),
    allowedScope: 'Temporary Tiny Quest only; helper reads; main fixes three arithmetic bugs, adds three tests and runs npm test once',
    anonymization: 'Temporary paths and original session/subagent/terminal IDs replaced consistently; event text/results and receipt intervals otherwise preserved' }, null, 2) + '\n');
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
  writeFileSync(`${output}/cleanup.json`, JSON.stringify({ port, complete, lifecycle: safe(lifecycle), serverExited: server.exitCode !== null,
    remainingPids: alive, temporaryDataRemoved: !existsSync(root), userSettingsChanged: false }, null, 2) + '\n');
  assert.equal(alive.length, 0, 'Recording processes remain alive');
}
