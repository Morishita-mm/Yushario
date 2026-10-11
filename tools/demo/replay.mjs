// Replays genuine, redacted AgentEvents, never sends PTY input or starts an agent.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { pause } from './cdp.mjs';
export async function postEntry(url, entry) {
  if (entry.event) {
    // The current application contract is POST /event, not /api/events.
    const response = await fetch(new URL('/event', url), { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...entry.event, ts: Date.now() }) });
    if (response.status !== 204) throw new Error(`Event rejected: ${response.status} ${await response.text()}`);
  } else if (entry.permission) {
    // Recreate the recorded permission UI; there is no underlying tool execution.
    const permission = entry.permission;
    const detail = permission.summary.slice(permission.tool.length + 2);
    const body = { hook_event_name: 'PermissionRequest', session_id: permission.agent,
      cwd: `/demo/${permission.name ?? 'tiny-quest'}`, tool_name: permission.tool,
      tool_input: permission.tool === 'Bash' ? { command: detail } : { file_path: detail } };
    void fetch(new URL('/hooks/permission', url), { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body) }).then(async (response) => {
      if (!response.ok) console.error(`Permission replay failed: ${response.status}`);
    }).catch((error) => console.error(error.message));
  }
}
export async function replay(url, recording) {
  const start = performance.now();
  for (const entry of recording.timeline) {
    await pause(Math.max(0, entry.atMs - (performance.now() - start)));
    await postEntry(url, entry);
    const observation = entry.event?.hook ?? (entry.permission ? 'permission UI' : 'permission resolution (no decision sent)');
    console.log(`${(entry.atMs / 1000).toFixed(2)}s recorded #${entry.originIndex}: ${observation}`);
  }
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [url, input] = process.argv.slice(2);
  if (!url || !input) throw new Error('Usage: node tools/demo/replay.mjs <app-url> <timeline.json>');
  await replay(url, JSON.parse(readFileSync(input, 'utf8')));
}
