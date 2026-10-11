// QA the completed AUDIO MP4s, extract cuts/actions/flash plus whole intro movement.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { shots, contactTimes, duration } from './pv3-shots.mjs';
const root = resolve(process.argv[2] ?? '.art-work/s87');
const samples = shots.map(s => [s.kind === 'reveal' ? s.start + 29 / 30 : s.kind === 'test' ? s.start + 1.2 : s.kind === 'title' ? s.start + 0.3 : s.start + s.seconds / 2,
  `s${String(s.number).padStart(2, '0')}`]);
for (const [i, t] of [...contactTimes, 17].sort((a, b) => a - b).entries())
  for (const [d, label] of [[-1 / 30, 'before'], [0, 'contact'], [8 / 30, 'after']]) samples.push([t + d, `hit-${i + 1}-${label}`]);
for (const [t, label] of [[6, 'heroes-start'], [6.5, 'heroes-mid1'], [7.5, 'heroes-mid2'], [8 - 1 / 30, 'heroes-end'],
  [13, 'church-start'], [14.5, 'church-pose'], [15, 'inn-start'], [16.5, 'inn-sleep'], [17.9, 'pi-pre'], [18.5, 'pi-post'],
  [24, 'reveal-start'], [24.5, 'reveal-mid'], [33, 'flash-1'], [33 + 1 / 30, 'flash-2'], [33 + 2 / 30, 'flash-3'],
  [33.1, 'flash-end'], [35, 'cta-on'], [38.9, 'last']]) samples.push([t, label]);
const checks = [];
for (const lang of ['ja', 'en']) for (const ratio of ['16x9', '1x1']) {
  const name = `pv3-${lang}-${ratio}`, file = join(root, `${name}.mp4`), dir = join(root, 'qa', name);
  mkdirSync(dir, { recursive: true });
  const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
  const v = info.streams.find(s => s.codec_type === 'video'), a = info.streams.find(s => s.codec_type === 'audio');
  if (+info.format.duration !== duration || v.width !== (ratio === '1x1' ? 1080 : 1920) || v.height !== 1080
    || v.r_frame_rate !== '30/1' || v.codec_name !== 'h264' || v.pix_fmt !== 'yuv420p' || +v.nb_frames !== duration * 30
    || a?.codec_name !== 'aac' || +a.sample_rate !== 48000 || a.channels !== 2) throw Error(`${name}: bad media format`);
  for (const [time, label] of samples) execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(time), '-i', file, '-frames:v', '1', join(dir, `${label}.png`)]);
  checks.push({ name, seconds: duration, width: v.width, height: v.height, fps: v.r_frame_rate, frames: +v.nb_frames,
    audio: { codec: a.codec_name, sampleRate: +a.sample_rate, channels: a.channels },
    extractions: samples.map(([time, label]) => ({ time, frame: Math.round(time * 30), file: `qa/${name}/${label}.png` })) });
}
writeFileSync(join(root, 'video-info.json'), JSON.stringify(checks, null, 2) + '\n');
console.log(`4 completed audio MP4s: ${duration}s / ${duration * 30} frames / AAC 48k stereo; ${samples.length * 4} final-video frames extracted.`);
