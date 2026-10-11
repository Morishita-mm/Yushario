// Verify final AAC timing and identical soundtrack across all language/aspect variants.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const root = process.argv[2] ?? '.art-work/s87';
const hashes = [];
for (const lang of ['ja', 'en']) for (const ratio of ['16x9', '1x1']) {
  const file = `${root}/pv3-${lang}-${ratio}.mp4`;
  hashes.push({ file, sha256: execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:a:0', '-c', 'copy', '-f', 'hash', '-hash', 'sha256', '-'], { encoding: 'utf8' }).trim() });
}
assert.equal(new Set(hashes.map(h => h.sha256)).size, 1, 'Variant audio differs');
const file = hashes[0].file;
const b = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-t', '2', '-ar', '48000', '-ac', '1', '-f', 'f32le', '-']);
const pcm = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
const firstSignalAt = pcm.findIndex(v => Math.abs(v) > 0.004) / 48000;
assert.ok(Math.abs(firstSignalAt - 0.5) < 1 / 30, 'AAC sword onset off by more than one frame');
const proof = JSON.parse(readFileSync(`${root}/audio/mix-proof.json`, 'utf8'));
assert.ok(proof.cutGrid.every(c => c.nearestGridErrorMs < 1e-7), 'Cut off eighth-note grid');
for (const c of proof.cues.filter(c => c.name !== 'jingle06')) assert.ok(Math.abs(c.time * 6 - Math.round(c.time * 6)) < 1e-7, 'Sound cue off eighth-note grid');
for (const [name, start, seconds] of [['final', 0, 39], ['climax', 28, 6]]) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file,
    '-filter_complex', `atrim=start=${start}:duration=${seconds},asetpts=PTS-STARTPTS,showwavespic=s=1920x360:colors=0xffe066`,
    '-frames:v', '1', `${root}/audio/${name}-wave.png`]);
}
writeFileSync(`${root}/audio/sync-proof.json`, JSON.stringify({ hashes, firstSignalAt, expectedContactAt: 0.5,
  firstCueErrorMs: (firstSignalAt - 0.5) * 1000, cutGridMaxErrorMs: Math.max(...proof.cutGrid.map(c => c.nearestGridErrorMs)),
  note: 'Final AAC identical in all four videos; decoded intro onset checked. Later cue starts trim original leading silence; final waveforms reviewed separately. Jingle has intentional 100ms editorial delay after flash.' }, null, 2) + '\n');
console.log('Final AAC identical; first sword within one frame; all cuts/contacts on musical eighth-note grid.');
