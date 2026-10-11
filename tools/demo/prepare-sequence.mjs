// Lossless event ordering per real recording; overlay multiple heroes without cloning IDs.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
const [output, ...inputs] = process.argv.slice(2);
if (!output || !inputs.length) throw new Error('Usage: node tools/demo/prepare-sequence.mjs <timeline.json> <recording.jsonl> [...]');
const timeline = [], sessions = [];
for (const input of inputs) {
  const rows = readFileSync(input, 'utf8').trim().split('\n').map(JSON.parse);
  const originFile = relative(dirname(resolve(output)), resolve(input));
  const first = rows.find((row) => row.event?.hook === 'SessionStart');
  if (!first) throw new Error(`Missing SessionStart: ${input}`);
  sessions.push({ id: first.event.terminal, preset: 'claude', project: first.event.project,
    cwd: `/demo/${first.event.project}`, createdAt: first.at });
  let atMs = 0, previous = rows[0].recordedAt;
  rows.forEach((row, originIndex) => {
    atMs += Math.min(1200, Math.max(0, row.recordedAt - previous));
    previous = row.recordedAt;
    // Retain real cleanup in the source, but hold the heroes for the last video card.
    if (row.event?.hook === 'SessionEnd') return;
    timeline.push({ atMs, originFile, originIndex,
      ...(row.event ? { event: row.event } : row.type === 'permission' ? { permission: row } : { resolved: row }) });
  });
}
timeline.sort((a, b) => a.atMs - b.atMs);
writeFileSync(output, JSON.stringify({ durationMs: timeline.at(-1).atMs + 4000, sessions,
  note: 'All observations in source order; gaps capped at 1200ms; each recording starts together; cleanup SessionEnd omitted. No outcomes or IDs changed.',
  timeline }, null, 2) + '\n');
console.log(`Prepared ${timeline.length} observations from ${inputs.length} genuine recording(s)`);
