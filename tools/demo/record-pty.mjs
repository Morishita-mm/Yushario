// Capture only a newly created demo PTY. No input, approval or CLI history access.
import { appendFileSync, writeFileSync } from 'node:fs';
import WebSocket from 'ws';
import { redact } from './redact.mjs';
const [url, session, output] = process.argv.slice(2);
if (!url || !session || !output) throw new Error('Usage: node tools/demo/record-pty.mjs <app-url> <demo-session-id> <output.jsonl>');
const address = new URL('/pty', url);
address.protocol = 'ws:';
address.search = new URL(url).search;
address.searchParams.set('session', session);
writeFileSync(output, '');
const socket = new WebSocket(address, { origin: new URL(url).origin });
socket.on('message', (raw) => {
  appendFileSync(output, JSON.stringify({ recordedAt: Date.now(), session, data: redact(String(raw)) }) + '\n');
});
socket.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
socket.on('open', () => console.log('Recording demo PTY output only (redacted)'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => socket.close());
