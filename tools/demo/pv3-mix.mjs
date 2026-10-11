// Maou Damashii assets stay in ignored .art-work; no deps, no synthesis/training.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { duration, contactTimes, shots } from './pv3-shots.mjs';
const root = process.argv[2] ?? '.art-work/s87', audio = `${root}/audio`;
const ff = args => execFileSync('ffmpeg', ['-hide_banner', '-y', ...args], { encoding: 'utf8', maxBuffer: 30e6 });
const onset = name => {
  const b = execFileSync('ffmpeg', ['-v', 'error', '-i', `${audio}/maoudamashii-${name}.mp3`, '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { maxBuffer: 3e6 });
  const pcm = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
  return pcm.findIndex(x => Math.abs(x) > 0.003) / 48000;
};
const files = ['fantasy11', 'battle17', 'magical25', 'onepoint03', 'jingle06'];
const onsets = Object.fromEntries(files.slice(1).map(n => [n, onset(n)]));
const bgmStart = 4 + 7 / 30, bgmAt = 2, bpm = 180, beat = 1 / 3;
const cues = [...contactTimes, 17].sort((a, b) => a - b).map(t => ({ name: 'battle17', time: t, gain: 0.6 }));
cues.push({ name: 'onepoint03', time: 19.5, gain: 0.28 }, { name: 'magical25', time: 33, gain: 0.18 }, { name: 'jingle06', time: 33.1, gain: 0.26 });
const filters = [
  `[0:a]atrim=start=${bgmStart}:duration=37,asetpts=PTS-STARTPTS,aresample=48000,` +
  `volume='if(lt(t,11),0.40,if(lt(t,15),0.20,if(lt(t,19),0.44,if(lt(t,22),0.13,if(lt(t,31),0.65,0.09)))))':eval=frame,` +
  `afade=t=in:d=0.035,afade=t=out:st=35.4:d=1.6,adelay=2000|2000,apad,atrim=duration=${duration}[music]`,
];
const inputs = ['-i', `${audio}/maoudamashii-fantasy11.mp3`], labels = ['[music]'];
for (const [i, c] of cues.entries()) {
  inputs.push('-i', `${audio}/maoudamashii-${c.name}.mp3`);
  filters.push(`[${i + 1}:a]atrim=start=${onsets[c.name]},asetpts=PTS-STARTPTS,aresample=48000,volume=${c.gain},` +
    (c.name === 'jingle06' ? 'afade=t=out:st=4.5:d=1.4,' : '') + `adelay=${Math.round(c.time * 1000)}|${Math.round(c.time * 1000)}[fx${i}]`);
  labels.push(`[fx${i}]`);
}
filters.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=longest,atrim=duration=${duration}[mix]`);
ff([...inputs, '-filter_complex', filters.join(';'), '-map', '[mix]', '-c:a', 'pcm_f32le', `${audio}/maoudamashii-mix-raw.wav`]);
// ffmpeg measurements are on stderr, so use spawnSync for the two-pass meter.
const { spawnSync } = await import('node:child_process');
const meter = args => {
  const r = spawnSync('ffmpeg', ['-hide_banner', ...args], { encoding: 'utf8' });
  if (r.status) throw Error(r.stderr); const blocks = r.stderr.match(/\{[\s\S]*?\}/g); return JSON.parse(blocks.at(-1));
};
const m = meter(['-i', `${audio}/maoudamashii-mix-raw.wav`, '-af', 'loudnorm=I=-15:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-']);
const norm = `loudnorm=I=-15:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=json`;
ff(['-i', `${audio}/maoudamashii-mix-raw.wav`, '-af', norm, '-ar', '48000', '-c:a', 'pcm_s24le', `${audio}/maoudamashii-pv3-master.wav`]);
const final = [];
for (const lang of ['ja', 'en']) for (const ratio of ['16x9', '1x1']) {
  const name = `pv3-${lang}-${ratio}`;
  ff(['-i', `${root}/${name}.video.mp4`, '-i', `${audio}/maoudamashii-pv3-master.wav`, '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(duration), '-movflags', '+faststart', `${root}/${name}.mp4`]);
  const metrics = meter(['-i', `${root}/${name}.mp4`, '-af', 'loudnorm=I=-15:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-']);
  if (+metrics.input_i < -16 || +metrics.input_i > -14 || +metrics.input_tp > -1) throw Error('Final AAC loudness/clipping failed');
  final.push({ name, integratedLufs: +metrics.input_i, truePeakDbtp: +metrics.input_tp, lra: +metrics.input_lra });
}
ff(['-i', `${audio}/maoudamashii-pv3-master.wav`, '-filter_complex', 'showwavespic=s=1920x360:colors=0xffe066', '-frames:v', '1', `${audio}/mix-wave.png`]);
for (const n of ['06', '11', '13']) ff(['-i', `${audio}/maoudamashii-fantasy${n}.mp3`, '-t', '40', '-af', 'loudnorm=I=-16:TP=-2:LRA=11', '-ar', '48000', `${audio}/maoudamashii-audition${n}.wav`]);
writeFileSync(`${audio}/mix-proof.json`, JSON.stringify({ duration, bpm, beat, editingPulse: 120, bgmStart, bgmAt,
  note: '180 BPM quarter=10 frames; cuts and contact cues on quarters/eighths, original pitch/speed unchanged. Dotted-quarter 0.5s montage pulse is not track BPM.',
  onsets, cues, cutGrid: shots.map(s => ({ cut: s.number, time: s.start, quarter: s.start * 3, eighth: s.start * 6,
    nearestGridErrorMs: Math.abs(s.start * 6 - Math.round(s.start * 6)) * 1000 / 6 })), measuredRaw: m, final }, null, 2) + '\n');
console.log(final);
