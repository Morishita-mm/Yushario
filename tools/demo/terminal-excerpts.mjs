// Decode the captured ANSI with the already installed xterm; crop, never rewrite, CLI text.
import { readFileSync } from 'node:fs';
import { main } from './shots.mjs';
export async function terminalExcerpts(cdp) {
  await cdp.evaluate(readFileSync(new URL('../../node_modules/@xterm/xterm/lib/xterm.js', import.meta.url), 'utf8'));
  await cdp.evaluate(`(() => {
    const host=document.createElement('div');host.style.cssText='position:absolute;left:-10000px;width:2000px;height:1400px';document.body.append(host);
    window.__decoder=new Terminal({cols:190,rows:55,scrollback:3000,disableStdin:true});window.__decoder.open(host);
  })()`);
  const raw = readFileSync(new URL('recordings-v2/main-pty.jsonl', import.meta.url), 'utf8').trim().split('\n').map(JSON.parse);
  const snapshots = {};
  const manualAt = raw.find((row) => row.data.includes('manual mode on'))?.recordedAt;
  if (!manualAt || manualAt >= main[1].recordedAt) throw new Error('No genuine pre-request manual-mode evidence');
  for (const [name, at] of [['setup', main[0].recordedAt - 10000], ['manual', manualAt + 200],
    ...[1, 2, 25, 36, 39, 45, 51, 57, 63, 69, 72, 75].map((index) => [String(index), main[index].recordedAt + 100])]) {
    const until = raw.findLastIndex((row) => row.recordedAt <= at);
    const data = raw.slice(0, until + 1).map((row) => row.data).join('');
    snapshots[name] = await cdp.evaluate(`new Promise(resolve=>{
      __decoder.reset();__decoder.write(${JSON.stringify(data)},()=>{
        const b=__decoder.buffer.active;resolve(Array.from({length:b.length},(_,i)=>b.getLine(i).translateToString(true)));
      });
    })`);
    snapshots[name] = { lines: snapshots[name], origin: 'main-pty.jsonl', throughIndex: until, recordedAt: at };
  }
  const final = readFileSync(new URL('recordings-v2/main-terminal.txt', import.meta.url), 'utf8').split('\n');
  snapshots.final = { lines: final, origin: 'main-terminal.txt' };
  snapshots.startup = { lines: readFileSync(new URL('recordings-v2/startup.txt', import.meta.url), 'utf8').split('\n'), origin: 'startup.txt' };
  await cdp.evaluate('__decoder.dispose()');
  return snapshots;
}
export function excerpt(snapshot, marker = '', count = 24) {
  const lines = snapshot.lines.map((line) => line.trimEnd());
  // Crop only long horizontal rules to panel width; keep every command/code/result character.
  const cropRule = (line) => /^[─╌\- ]{40,}$/.test(line) ? line.slice(0, 56) : line;
  const found = marker ? lines.findLastIndex((line) => line.includes(marker)) : -1;
  let start = found >= 0 ? Math.max(0, found - 1) : Math.max(0, lines.findLastIndex((line) => line.trim()) - count + 1);
  // A selected command block includes its real output, without the prompt/footer noise.
  return { ...snapshot, lines: undefined, startLine: start, text: lines.slice(start, start + count).map(cropRule).join('\n').trimEnd() };
}
export function demoTerminal(snapshots, ms) {
  if (ms < 6000) return excerpt(snapshots.startup, '', 12);
  if (ms < 12000) return excerpt(snapshots.setup, 'Accessing workspace', 23);
  if (ms < 17000) return excerpt(snapshots.manual, 'manual mode on', 8);
  if (ms < 25000) return excerpt(snapshots['1'], 'このデモ', 23);
  if (ms < 30000) return excerpt(snapshots['2'], 'Explore', 23);
  if (ms < 35000) return excerpt(snapshots['25'], 'Read', 23);
  if (ms < 44000) return excerpt(snapshots['36'], 'Edit file', 24);
  if (ms < 46000) return excerpt(snapshots['39'], 'return coins', 22);
  if (ms < 48200) return excerpt(snapshots['45'], 'return items', 22);
  if (ms < 50400) return excerpt(snapshots['51'], 'hp', 22);
  if (ms < 52600) return excerpt(snapshots['57'], 'zero bonus', 22);
  if (ms < 54800) return excerpt(snapshots['63'], 'zero extra', 22);
  if (ms < 58000) return excerpt(snapshots['69'], 'caps at 100', 22);
  if (ms < 62000) return excerpt(snapshots['72'], 'Bash command', 22);
  if (ms < 65000) return excerpt(snapshots.final, 'Bash(npm test', 19);
  return excerpt(snapshots.final, '3つのバグを直し', 17);
}
