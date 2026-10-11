// Extract the relay's in-memory replay and live messages; never reads CLI history.
import { appendFileSync, writeFileSync } from 'node:fs';
import WebSocket from 'ws';
import { redact } from './redact.mjs';
const [url, output] = process.argv.slice(2);
if (!url || !output) throw new Error('Usage: node tools/demo/record.mjs <app-url-with-token> <output.jsonl>');
const origin = new URL(url).origin;
const socketUrl = new URL('/ws', url);
socketUrl.protocol = 'ws:';
socketUrl.search = new URL(url).search;
writeFileSync(output, '');
const socket = new WebSocket(socketUrl, { origin });
socket.on('message', (raw) => {
  const data = JSON.parse(String(raw));
  const rows = data.type === 'replay' ? data.events.map((item) => ({ type: 'event', ...item })) : [data];
  for (const row of rows) if (['event', 'permission', 'permission-resolved'].includes(row.type)) {
    appendFileSync(output, JSON.stringify(redact({ recordedAt: Date.now(), ...row })) + '\n');
  }
});
socket.on('open', () => console.log('Recording server replay/live (redacted)'));
socket.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => socket.close());
