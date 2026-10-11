// Inspect completed MP4s, not source stills. Eight scenes + two action/result frames.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
const output = resolve(process.argv[2] ?? '.art-work/s85');
const samples = [[1, 's1'], [4, 's2'], [6, 's3-party'], [8.4, 's4-hit'], [9, 's4'],
  [11.8, 's5-test'], [12.8, 's5-result'], [14.4, 's6-level'], [16, 's7-report'], [21, 's8-title']];
const checks = [];
for (const language of ['ja', 'en']) for (const ratio of ['16x9', '1x1']) {
  const name = `pv-${language}-${ratio}`, file = join(output, `${name}.mp4`), directory = join(output, 'qa', name);
  mkdirSync(directory, { recursive: true });
  const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
  const video = info.streams.find(s => s.codec_type === 'video');
  if (+info.format.duration !== 24 || video.width !== (ratio === '1x1' ? 1080 : 1920) || video.height !== 1080
    || video.r_frame_rate !== '30/1' || video.codec_name !== 'h264' || video.pix_fmt !== 'yuv420p'
    || +video.nb_frames !== 720 || info.streams.some(s => s.codec_type === 'audio')) throw Error(`${name}: format mismatch`);
  for (const [time, scene] of samples) execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(time), '-i', file,
    '-frames:v', '1', join(directory, `${scene}.png`)]);
  checks.push({ name, seconds: +info.format.duration, width: video.width, height: video.height, fps: video.r_frame_rate,
    codec: video.codec_name, pixelFormat: video.pix_fmt, frameCount: +video.nb_frames,
    audio: false, frames: samples.map(([seconds, scene]) => ({ seconds, path: `qa/${name}/${scene}.png` })) });
}
writeFileSync(join(output, 'video-info.json'), JSON.stringify(checks, null, 2) + '\n');
console.log('4 completed MP4s verified; 40 frames re-extracted for visual review.');
