// Editorial selection: every event refers back to the real relay recording.
import { readFileSync, writeFileSync } from 'node:fs';
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node tools/demo/prepare.mjs recorded.jsonl timeline.json');
const rows = readFileSync(input, 'utf8').trim().split('\n').map(JSON.parse);
const find = (hook, tool, target, helper = false) => rows.findIndex((row) => row.type === 'event'
  && row.event.hook === hook && (!tool || row.event.tool === tool)
  && (!target || row.event.target === target) && Boolean(row.event.subagent) === helper);
const timeline = [];
function add(atMs, index) {
  if (index < 0) throw new Error(`Missing recorded scene at ${atMs}`);
  const row = rows[index];
  const event = row.event && { ...row.event, ...(row.event.terminal ? { terminal: rows[0].event.terminal } : {}) };
  timeline.push({ atMs, originIndex: index, ...(row.type === 'event' ? { event } : { permission: row }) });
}
add(0, find('SessionStart'));
add(7800, find('UserPromptSubmit'));
for (const [i, name] of ['quest.mjs', 'quest.test.mjs'].entries()) {
  add(8100 + i * 400, find('PreToolUse', 'Read', name));
  add(8250 + i * 400, find('PostToolUse', 'Read', name));
}
add(10000, find('PreToolUse', 'Edit', 'quest.mjs'));
add(11150, find('PostToolUse', 'Edit', 'quest.mjs'));
add(13500, find('PreToolUse', 'Edit', 'quest.test.mjs'));
add(14650, find('PostToolUse', 'Edit', 'quest.test.mjs'));
add(16500, find('PreToolUse', 'Bash', 'npm test'));
add(17650, find('PostToolUse', 'Bash', 'npm test'));
// Show the helper scene after solo combat, matching the requested storyboard.
add(19500, find('PreToolUse', 'Agent'));
add(19550, find('SubagentStart', undefined, undefined, true));
for (const [i, name] of ['quest.mjs', 'quest.test.mjs'].entries()) {
  add(20000 + i * 400, find('PreToolUse', 'Read', name, true));
  add(20150 + i * 400, find('PostToolUse', 'Read', name, true));
}
add(22900, find('PostToolUse', 'Agent'));
add(23500, find('SubagentStop', undefined, undefined, true));
add(25000, rows.findIndex((row) => row.type === 'permission' && row.tool === 'Bash'));
add(27900, find('Notification'));
add(29500, rows.findLastIndex((row) => row.type === 'event' && row.event.hook === 'Stop'));
const metadata = { durationMs: 42000,
  note: 'Two authentic requests consolidated; helper sequence moved after solo combat; resumed PTY metadata mapped to one replay terminal; intermediate Stop/internal task notification omitted. No invented tool outcomes.',
  session: { id: rows[0].event.terminal, preset: 'claude', cwd: '/demo/tiny-quest', project: 'tiny-quest', createdAt: rows[0].at, weapon: 'legend' },
};
const lines = timeline.sort((a, b) => a.atMs - b.atMs).map((entry) => `  ${JSON.stringify(entry)}`);
writeFileSync(output, `${JSON.stringify(metadata, null, 2).slice(0, -2)},\n "timeline": [\n${lines.join(',\n')}\n ]\n}\n`);
console.log(`Prepared ${timeline.length} authentic scene events`);
