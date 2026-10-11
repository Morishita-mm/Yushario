// Extract exact integer frames from completed silent MP4s, not source roughs.
import { mkdirSync, writeFileSync, renameSync, copyFileSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { shots, contactTimes, duration, themes } from './pv4-shots.mjs';
const root = resolve(process.argv[2] ?? '.art-work/s88/video');
const samples = shots.map(s => [s.start * 30 + (s.kind === 'reveal' ? 29 : s.kind === 'test' ? 36 : s.kind === 'title' ? 8 : Math.floor(s.seconds * 15)),
  `s${String(s.number).padStart(2, '0')}`]);
for (const [i, time] of contactTimes.entries()) for (const [delta, label] of [[-1, 'before'], [0, 'contact'], [8, 'after']])
  if (time * 30 + delta >= 0) samples.push([time * 30 + delta, `hit-${i + 1}-${label}`]);
for (const [i, theme] of themes.entries()) {
  samples.push([240 + i * 45 + 23, `biome-${theme}-mid`]);
  if (i) for (const [delta, label] of [[-1, 'before'], [0, 'start'], [5, 'blend-end'], [6, 'after']])
    samples.push([240 + i * 45 + delta, `biome-${theme}-${label}`]);
}
for (const [n, label] of [[705, 'chest-received'], [764, 'chest-before-open'], [765, 'chest-open'], [855, 'chest-readable'], [944, 'chest-end'],
  [660, 'level-up'], [1035, 'reveal-start'], [1050, 'reveal-mid'], [1305, 'flash-1'], [1306, 'flash-2'], [1307, 'flash-3'],
  [1308, 'flash-end'], [1365, 'cta-on'], [1484, 'last']]) samples.push([n, label]);
const checks = [];
for (const lang of ['ja', 'en']) for (const ratio of ['16x9', '1x1']) {
  const name = `pv4-${lang}-${ratio}`, file = join(root, `${name}.mp4`), dir = join(root, 'qa', name);
  mkdirSync(dir, { recursive: true });
  const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
  const v = info.streams.find(s => s.codec_type === 'video');
  if (+info.format.duration !== duration || v.width !== (ratio === '1x1' ? 1080 : 1920) || v.height !== 1080
    || v.r_frame_rate !== '30/1' || v.codec_name !== 'h264' || v.pix_fmt !== 'yuv420p' || +v.nb_frames !== duration * 30
    || info.streams.some(s => s.codec_type === 'audio')) throw Error(`${name}: wrong format / unexpected audio`);
  // The real dialog's right border must be visible: catch native screenshots shrunk into a PNG's upper-left quarter.
  const edge = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', '28.5', '-i', file,
    '-vf', `crop=20:750:${ratio === '1x1' ? 1024 : 1810}:225,signalstats,metadata=print:file=-`,
    '-frames:v', '1', '-f', 'null', '/dev/null'], { encoding: 'utf8' });
  const borderMax = +(edge.match(/lavfi\.signalstats\.YMAX=(\d+)/)?.[1] ?? 0);
  if (borderMax < 210) throw Error(`${name}: native report was scaled into unused padding`);
  const frames = [...new Set(samples.map(([n]) => n))].sort((a, b) => a - b);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', file,
    '-vf', `select='${frames.map(n => `eq(n,${n})`).join('+')}'`, '-vsync', '0', join(dir, '%03d.png')]);
  for (const [i, n] of frames.entries()) {
    const labels = samples.filter(([frame]) => frame === n).map(([, label]) => label);
    const target = join(dir, `${labels[0]}.png`); renameSync(join(dir, `${String(i + 1).padStart(3, '0')}.png`), target);
    for (const label of labels.slice(1)) copyFileSync(target, join(dir, `${label}.png`));
  }
  checks.push({ name, seconds: duration, width: v.width, height: v.height, fps: v.r_frame_rate, frames: +v.nb_frames,
    audioStreams: 0, nativeReportBorderYMax: borderMax, bytes: +info.format.size, sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
    extractions: samples.map(([frame, label]) => ({ time: frame / 30, frame, file: `qa/${name}/${label}.png` })) });
}
writeFileSync(join(root, 'video-info.json'), JSON.stringify(checks, null, 2) + '\n');
console.log(`4 silent completed MP4s: ${duration}s / ${duration * 30} frames; ${samples.length * 4} exact final-video frames extracted.`);
