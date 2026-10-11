// Explicit input to our verified app PTY; never Orca terminal/native input.
import { readFileSync } from 'node:fs';
import WebSocket from 'ws';
import { once } from 'node:events';
const [controlFile, mode, value] = process.argv.slice(2);
const { url } = JSON.parse(readFileSync(controlFile, 'utf8'));
const session = JSON.parse(readFileSync(controlFile.replace('control.json', 'session.json'), 'utf8'));
if (mode === 'read') {
  const text = readFileSync(controlFile.replace('control.json', 'terminal.txt'), 'utf8')
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-9;?><:]*[a-zA-Z~]/g, '').replace(/\x1b[78]/g, '');
  console.log(text.slice(-9000));
} else if (mode === 'input') {
  const ws = new WebSocket(url.replace('http:', 'ws:').replace('/?token=', `/pty?session=${session.id}&cols=110&rows=32&token=`), { origin: new URL(url).origin });
  await once(ws, 'open'); ws.send(JSON.stringify({ type: 'input', data: JSON.parse(value) }));
  await new Promise(r => setTimeout(r, 350)); ws.close();
} else {
  const endpoint = mode === 'say' ? 'say' : 'action';
  const r = await fetch(new URL(`/api/sessions/${session.id}/${endpoint}` + new URL(url).search, url), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mode === 'say' ? { text: value } : { action: mode }),
  });
  console.log(r.status, await r.text());
}
