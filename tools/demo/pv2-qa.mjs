// Validate the four completed movies and extract every cut + action/reveal boundary.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { shots, contactTimes } from './pv2-shots.mjs';
const output = resolve(process.argv[2] ?? '.art-work/s86');
const samples = shots.map(s => [s.number === 13 ? 15 + 29 / 30 : s.number === 8 ? 9.7 : s.number === 21 ? 24.3 : s.start + s.seconds / 2,
  `s${String(s.number).padStart(2, '0')}`]);
for (const [i, t] of contactTimes.entries()) for (const [delta, name] of [[-1 / 30, 'before'], [0, 'contact'], [8 / 30, 'after']])
  samples.push([t + delta, `hit-${i + 1}-${name}`]);
for (const [t, name] of [[8.9, 'pi-pre'], [9.5, 'pi-post'], [15, 'reveal-start'], [15.5, 'reveal-mid'],
  [24, 'flash-1'], [24 + 1 / 30, 'flash-2'], [24 + 2 / 30, 'flash-3'], [24.1, 'flash-end'], [26, 'cta-on'], [29.9, 'last']]) samples.push([t, name]);
const checks = [];
for (const language of ['ja', 'en']) for (const ratio of ['16x9', '1x1']) {
  const name = `pv2-${language}-${ratio}`, file = join(output, `${name}.mp4`), directory = join(output, 'qa', name);
  mkdirSync(directory, { recursive: true });
  const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
  const video = info.streams.find(s => s.codec_type === 'video');
  if (+info.format.duration !== 30 || video.width !== (ratio === '1x1' ? 1080 : 1920) || video.height !== 1080
    || video.r_frame_rate !== '30/1' || video.codec_name !== 'h264' || video.pix_fmt !== 'yuv420p'
    || +video.nb_frames !== 900 || info.streams.some(s => s.codec_type === 'audio')) throw Error(`${name}: format mismatch`);
  for (const [time, scene] of samples) execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(time), '-i', file,
    '-frames:v', '1', join(directory, `${scene}.png`)]);
  checks.push({ name, seconds: +info.format.duration, width: video.width, height: video.height, fps: video.r_frame_rate,
    codec: video.codec_name, pixelFormat: video.pix_fmt, frameCount: +video.nb_frames, bpm: 120, audio: false,
    frames: samples.map(([seconds, scene]) => ({ seconds, frame: Math.round(seconds * 30), path: `qa/${name}/${scene}.png` })) });
}
writeFileSync(join(output, 'video-info.json'), JSON.stringify(checks, null, 2) + '\n');
console.log(`4 completed MP4s verified: 30.000s / 900 frames / 30fps / no audio; ${samples.length * 4} QA frames re-extracted.`);
