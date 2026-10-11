// Extract actual encoded frames; legibility still requires a human viewing these PNGs.
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const output = resolve(process.argv[2] ?? '.art-work/s8/demo2');
const variants = ['demo-ja-16x9', 'demo-en-16x9', 'promo-ja-16x9', 'promo-en-16x9', 'promo-ja-1x1', 'promo-en-1x1'];
const metadata = [];
for (const name of variants) {
  const video = join(output, `${name}.mp4`), demo = name.startsWith('demo');
  const duration = demo ? 80 : 18, width = name.endsWith('1x1') ? 1080 : 1920;
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', video], { encoding: 'utf8' }));
  const stream = probe.streams.find((item) => item.codec_type === 'video');
  if (!stream || stream.width !== width || stream.height !== 1080 || stream.codec_name !== 'h264'
    || stream.pix_fmt !== 'yuv420p' || stream.avg_frame_rate !== '30/1'
    || Math.abs(Number(probe.format.duration) - duration) > 0.05 || probe.streams.some((item) => item.codec_type === 'audio'))
    throw new Error(`Unexpected video format: ${name}`);
  const folder = join(output, 'qa', name);mkdirSync(folder, { recursive: true });
  const frames = demo ? [['startup', 2], ['setup', 14.5], ['party', 28], ['lv2', 32.5], ['permission', 40.5],
    ['answer', 43.6], ['critical', 44.5], ['pack-hit', 47.4], ['health-hit', 49.6], ['quest-test-hit', 51.8],
    ['pack-test-hit', 54], ['lv3', 56.2], ['test-hit', 62.5], ['tests', 63.3], ['report', 68.5], ['ending', 77]]
    : [['town', 1], ['critical', 2.5], ['terminal', 3.2], ['party', 6.3], ['level', 9.3], ['permission', 11.5],
      ['confirmation', 12.2], ['answer', 12.8], ['edit-critical', 13.4], ['ending', 16]];
  for (const [scene, seconds] of frames) execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(seconds),
    '-i', video, '-frames:v', '1', '-update', '1', join(folder, `${scene}.png`)], { stdio: 'inherit' });
  metadata.push({ name, durationSeconds: Number(probe.format.duration), width: stream.width, height: stream.height,
    codec: stream.codec_name, pixelFormat: stream.pix_fmt, storedFps: stream.avg_frame_rate, captureFps: 10,
    frames: Number(stream.nb_frames), audio: false, bytes: statSync(video).size, extracted: frames.map(([scene, seconds]) => ({ scene, seconds })) });
  console.log(`${name}: ${probe.format.duration}s ${width}×1080, ${stream.nb_frames} frames; extracted ${frames.length} QA PNGs`);
}
writeFileSync(join(output, 'video-metadata.json'), JSON.stringify(metadata, null, 2) + '\n');
