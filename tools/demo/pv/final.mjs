// Mux the adopted B AAC without re-encoding; inspect all completed files.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, linkSync, rmSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { decode, stats, sha, loudness, ffmpeg } from './audio-io.mjs';
import { correlation, range } from './analysis.mjs';
const base = resolve('.art-work/pv'), videoRoot = join(base, 'video'), output = join(base, 'final');
mkdirSync(output, { recursive: true });
const audioProof = JSON.parse(readFileSync(join(base, 'audio/audio-proof.json')));
const videoInfo = JSON.parse(readFileSync(join(videoRoot, 'video-info.json')));
const cuesFile = join(videoRoot, 'cues.json'), cues = JSON.parse(readFileSync(cuesFile));
assert.equal(sha(cuesFile), audioProof.cuesSha256, 'Cues changed: retiming B would require a new score/mix');
copyFileSync(cuesFile, join(output, 'cues.json')); // Same silent-source timing document, not an audio-status claim.
const hashPcm = pcm => createHash('sha256').update(Buffer.from(pcm.buffer)).digest('hex');
const packetHash = (file, type) => execFileSync('ffmpeg', ['-v', 'error', '-i', file,
  '-map', `0:${type}:0`, '-c', 'copy', '-f', 'hash', '-hash', 'sha256', '-'], { encoding: 'utf8' }).trim();
const battle = new Set(['hit', 'test', 'level', 'back', 'challenge', 'reveal', 'party', 'dragon', 'hands', 'hero-hit', 'party-hit', 'dragon-hit', 'return']);
const records = [], signChecks = [];
for (const version of cues.variants) {
  const name = `pv-${version}`, source = join(videoRoot, `source-${version}.mp4`), original = join(base, 'audio/master.m4a');
  const file = join(output, `${name}.mp4`), dir = join(output, 'qa', name);
  assert.equal(sha(original), audioProof.masterSha256, 'Adopted B source changed');
  ffmpeg(['-i', source, '-i', original, '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy', '-movflags', '+faststart', file]);
  const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]));
  const v = info.streams.find(s => s.codec_type === 'video'), audio = info.streams.filter(s => s.codec_type === 'audio');
  assert.equal(info.streams.length, 2); assert.equal(audio.length, 1);
  const a = audio[0];
  assert.equal(v.width, version.endsWith('1x1') ? 1080 : 1920); assert.equal(v.height, 1080);
  assert.equal(v.codec_name, 'h264'); assert.equal(v.pix_fmt, 'yuv420p'); assert.equal(v.r_frame_rate, '30/1');
  assert.equal(+v.nb_frames, 1485); assert.equal(+info.format.duration, 49.5);
  assert.equal(a.codec_name, 'aac'); assert.equal(a.sample_rate, '48000'); assert.equal(a.channels, 2);
  for (const s of [v, a]) { assert.equal(+s.duration, 49.5); assert.equal(+s.start_time, 0); }
  const videoHash = packetHash(file, 'v'), audioHash = packetHash(file, 'a');
  assert.equal(videoHash, packetHash(source, 'v'), 'Retaken video was re-encoded');
  assert.equal(audioHash, packetHash(original, 'a'), 'B AAC packets changed');
  const pcm = decode(file), pcmHash = hashPcm(pcm), sample = stats(pcm), measure = loudness(file);
  assert.equal(pcmHash, hashPcm(decode(original)), 'B decoded PCM changed');
  assert.equal(sample.nonfinite, 0); assert.equal(sample.fullscale, 0); assert.ok(Math.abs(sample.dc) < .002);
  assert.ok(+measure.input_i >= -16.3 && +measure.input_i <= -15.7); assert.ok(+measure.input_tp <= -1.5);
  const channels = [0, 0], mono = new Float32Array(pcm.length / 2);
  for (let i = 0; i < mono.length; i++) {
    for (let c = 0; c < 2; c++) channels[c] += pcm[i * 2 + c] / mono.length;
    mono[i] = (pcm[i * 2] + pcm[i * 2 + 1]) / 2;
  }
  const monoDelta = stats(mono).rmsDbfs - sample.rmsDbfs;
  assert.ok(channels.every(dc => Math.abs(dc) < .002) && monoDelta > -1);
  const high = decode(file, 'highpass=f=2000');
  const sync = audioProof.effects.map(effect => {
    assert.ok(cues.effects.some(c => c.id === effect.id && c.frame === effect.frame && c.time === effect.time));
    const reference = decode(audioProof.processing[effect.key].path, 'highpass=f=2000');
    const result = correlation(reference, high, effect.placeAt);
    assert.equal(result.lagSamples, 0, `SE drift: ${name}/${effect.id}`); assert.ok(result.correlation > .4);
    return { id: effect.id, time: effect.time, frame: effect.frame, ...result };
  });
  const tail = range(pcm, 49.48, 49.5); assert.equal(tail.peak, 0);
  const proof = JSON.parse(readFileSync(join(videoRoot, `source-${version}.proof.json`)));
  const signFrames = proof.scenes.at(-1).after.signFrames;
  assert.equal(signFrames.length, 1485); assert.deepEqual(signFrames.map(s => s.frame), Array.from({ length: 1485 }, (_, i) => i));
  const combat = signFrames.filter(s => battle.has(s.kind));
  assert.ok(combat.length > 0); assert.ok(combat.every(s => s.draws.length === 0), 'Floating report in a battle');
  const preserved = ['town', 'church', 'inn', 'treasure'].map(kind => {
    const frames = signFrames.filter(s => s.kind === kind && (kind !== 'treasure' || s.frame < 765));
    const reports = frames.filter(s => s.draws.some(d => d.sheet === 'ui-report'));
    assert.ok(reports.length > 0, `Report signs disappeared from ${kind}`);
    return { kind, frames: frames.length, framesWithReportSigns: reports.length,
      framesWithExclamation: frames.filter(s => s.draws.some(d => d.sheet === 'ui-balloons')).length };
  });
  signChecks.push({ version, allFrames: signFrames.length, battleFrames: combat.length,
    battleReportSigns: combat.reduce((n, s) => n + s.draws.length, 0), preserved,
    observation: 'Real app world-canvas sprite calls at reportSigns scales .65/.85; drawImage is forwarded unchanged.' });
  mkdirSync(dir, { recursive: true });
  const sourceSamples = videoInfo.find(row => row.name === `source-${version}`).extractions;
  const samples = sourceSamples.map(row => ({ ...row, file: row.file.replace(`source-${version}`, name) }));
  const frames = [...new Set(samples.map(s => s.frame))].sort((x, y) => x - y);
  ffmpeg(['-i', file, '-vf', `select='${frames.map(n => `eq(n,${n})`).join('+')}'`, '-vsync', '0', join(dir, '%03d.png')]);
  for (const [i, n] of frames.entries()) {
    const paths = samples.filter(s => s.frame === n).map(s => join(output, s.file));
    const extracted = join(dir, `${String(i + 1).padStart(3, '0')}.png`);
    const silent = join(videoRoot, sourceSamples.find(s => s.frame === n).file);
    assert.equal(sha(extracted), sha(silent), 'Completed-video pixels differ from verified silent frames');
    // Keep every QA path without storing identical pixels twice on the filming disk.
    unlinkSync(extracted);
    for (const path of paths) { rmSync(path, { force: true }); linkSync(silent, path); }
  }
  const edgeLog = ffmpeg(['-ss', '28.5', '-i', file, '-vf',
    `crop=20:750:${v.width === 1080 ? 1024 : 1810}:225,signalstats,metadata=print`, '-frames:v', '1', '-f', 'null', '-']);
  const borderMax = +(edgeLog.match(/lavfi\.signalstats\.YMAX=(\d+)/)?.[1] ?? 0); assert.ok(borderMax >= 210);
  // Inspect the actual encoded tagline band, below the logo and after the opening flash.
  const titleLog = ffmpeg(['-i', file, '-vf',
    `select='between(n,1308,1484)',crop=iw:150:0:${v.width === 1080 ? 580 : 680},signalstats,metadata=print`, '-an', '-f', 'null', '-']);
  const taglineChecks = [...titleLog.matchAll(/lavfi\.signalstats\.YMAX=(\d+)/g)].map((m, i) => ({ frame: 1308 + i, max: +m[1] }));
  assert.equal(taglineChecks.length, 177);
  for (const row of taglineChecks) assert.ok(row.frame < 1398 ? row.max < 100 : row.max > 200,
    `${name}: encoded tagline visibility is wrong at f${row.frame}`);
  writeFileSync(join(output, `${name}.ffprobe.json`), JSON.stringify(info, null, 2) + '\n');
  records.push({ name, file, seconds: 49.5, fps: '30/1', frames: 1485, width: v.width, height: v.height,
    audioStreams: 1, audioStart: +a.start_time, videoStart: +v.start_time, bytes: +info.format.size, sha256: sha(file),
    nativeReportBorderYMax: borderMax, taglineChecks, videoPacketHash: videoHash, audioPacketHash: audioHash, pcmHash,
    lufs: +measure.input_i, truePeak: +measure.input_tp, loudnessRange: +measure.input_lra, stats: sample,
    channelDc: channels, monoDelta, decodedSeconds: pcm.length / 96000, tail, sync, extractions: samples });
  console.log(`${name}: B packets/PCM unchanged, ${measure.input_i} LUFS / ${measure.input_tp} dBTP, seven SE anchors = 0 samples.`);
}
assert.equal(new Set(records.map(r => r.pcmHash)).size, 1);
writeFileSync(join(output, 'video-info.json'), JSON.stringify(records, null, 2) + '\n');
writeFileSync(join(output, 'sign-checks.json'), JSON.stringify(signChecks, null, 2) + '\n');
writeFileSync(join(output, 'qa-proof.json'), JSON.stringify({ cuesSha256: sha(cuesFile), cuesUnchanged: true,
  audioSource: 'Adopted B AAC; direct stream copy, no re-encode/gain/retiming', records, signChecks,
  humanListening: false, note: 'Frames are extracted from final sound MP4s; inspect them visually before publishing.' }, null, 2) + '\n');
console.log(`Four final MP4s and ${records.reduce((n, record) => n + record.extractions.length, 0)} exact completed-video frame samples verified (including corrected scenes every 0.1s).`);
