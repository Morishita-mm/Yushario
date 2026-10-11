// S8.3 auditions only: original scores, no app changes or external audio assets.
// Run from any cwd: node tools/demo/audio.mjs (Node 22+, ffmpeg / ffprobe).
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../../', import.meta.url));
const source = join(root, '.art-work/s8/demo2');
const output = join(root, '.art-work/s83/audio');
const rate = 48000, seconds = 18;
const proof = JSON.parse(readFileSync(join(source, 'promo-ja-16x9.proof.json')));
const retake = JSON.parse(readFileSync(join(source, 'retake-proof.json')));
const scene = (name) => proof.scenes.find((s) => s.scene === name).ms / 1000;
const event = (index) => proof.trace.find((t) => t.originIndex === index).atMs / 1000;
const critical1 = scene('02-critical');
const critical2 = retake.capturedVariants.find((v) => v.name === proof.name).hitMs / 1000;
const party = proof.trace.find((t) => t.cut && t.originRange?.[1] === 3).atMs / 1000;
const ending = proof.trace.find((t) => t.cut && t.originRange?.[1] === 77).atMs / 1000;
if (proof.durationMs !== seconds * 1000 || scene('05b-edit-critical') !== critical2)
  throw new Error('Promo timing proof changed; review the score before rendering.');
const cues = [
  { sound: 'sword', at: critical1 - .06, impact: critical1, reference: 'scenes/02-critical (M#39)' },
  { sound: 'critical', at: critical1, reference: 'scenes/02-critical (69 damage)' },
  { sound: 'party', at: party, reference: 'trace/cut through M#3 SubagentStart' },
  { sound: 'level', at: event(69), reference: 'trace/M#69 (Lv3)' },
  { sound: 'permission', at: event(36), reference: 'trace/M#36 (permission packet)' },
  { sound: 'yes', at: event(38), reference: 'trace/M#38 (manual permission-resolved)' },
  { sound: 'sword', at: critical2 - .06, impact: critical2, reference: 'retake-proof/hitMs (M#39)' },
  { sound: 'critical', at: critical2, reference: 'retake-proof/hitMs (69 damage)' },
  { sound: 'chest', at: ending, reference: 'trace/cut through M#77 (report in town)' },
];
const buffer = (duration) => new Float32Array(Math.round(duration * rate) * 2);
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
let seed = 0x831a;
function blep(p, step) {
  if (p < step) { const x = p / step; return 2 * x - x * x - 1; }
  if (p > 1 - step) { const x = (p - 1) / step; return x * x + 2 * x + 1; }
  return 0;
}
// One voice with attack/release, optional linear pitch sweep, and equal-power pan.
function tone(dst, at, duration, f, wave, gain, pan = 0, end = f, duty = .5, decay = .6, attack = .004, release = .04) {
  const start = Math.round(at * rate), length = Math.round(duration * rate);
  const left = Math.cos((pan + 1) * Math.PI / 4), right = Math.sin((pan + 1) * Math.PI / 4);
  let phase = 0, noise = 0;
  for (let i = 0; i < length && (start + i) * 2 + 1 < dst.length; i++) {
    const t = i / rate, step = (f + (end - f) * i / length) / rate;
    phase = (phase + step) % 1;
    let value;
    if (wave === 'noise') {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      noise += .38 * (((seed >>> 0) / 2147483648 - 1) - noise); value = noise;
    } else if (wave === 'triangle') value = 1 - 4 * Math.abs(phase - .5);
    else value = (phase < duty ? 1 : -1) - (2 * duty - 1)
      + blep(phase, step) - blep((phase - duty + 1) % 1, step);
    const envelope = Math.max(0, Math.min(1, t / attack, (duration - t) / release)) * Math.exp(-decay * t / duration);
    const sample = value * gain * envelope, offset = (start + i) * 2;
    dst[offset] += sample * left; dst[offset + 1] += sample * right;
  }
}
function melody(dst, at, beat, notes, gain, wave = 'square', pan = -.12) {
  for (const [pitch, beats] of notes) {
    if (pitch) tone(dst, at, beats * beat * .8, hz(pitch), wave, gain, pan);
    at += beats * beat;
  }
}
// Hand-written pitches and asymmetric rhythms; no references to game music.
const bright = [
  [[81,.75],[76,.25],[83,.5],[79,.5],[86,1],[81,.5],[79,.5]],
  [[77,.5],[83,.5],[81,1],[76,.75],[79,.25],[74,.5],[77,.5]],
  [[79,.5],[86,.5],[83,.75],[81,.25],[77,1],[74,.5],[76,.5]],
  [[83,.75],[79,.25],[81,.5],[76,.5],[74,.5],[79,.5],[77,1]],
];
const march = [
  [[69,1],[74,.75],[76,.25],[72,.5],[79,.5],[76,1]],
  [[77,.75],[74,.25],[69,1],[72,.5],[67,.5],[71,1]],
  [[76,.5],[79,.5],[74,1],[72,.75],[69,.25],[65,1]],
  [[67,1],[72,.5],[71,.5],[76,.75],[74,.25],[69,1]],
];
const quiet = [
  [[71,2],[66,1],[69,1],[0,2],[74,1],[67,1]],
  [[64,1.5],[71,.5],[69,2],[0,1],[66,1],[64,2]],
  [[69,2],[64,1],[71,1],[0,2],[67,1],[66,1]],
  [[74,1.5],[69,.5],[67,1],[71,1],[0,2],[66,2]],
];
function music(kind) {
  const demo = kind === 'quiet', fast = kind === 'bright';
  const duration = demo ? 80 : ending, dst = buffer(demo ? 80 : seconds);
  const beat = 60 / (demo ? 76 : fast ? 132 : 104);
  const chords = demo ? [[40,47,54,59],[36,43,47,52],[33,40,47,52],[38,45,47,54]]
    : fast ? [[41,48,52,59],[45,52,55,60],[38,45,48,52],[43,50,52,57]]
    : [[38,45,48,52],[41,48,52,57],[43,50,53,57],[36,43,47,50]];
  const score = demo ? quiet : fast ? bright : march;
  const phraseBeats = demo ? 8 : 4;
  for (let phrase = 0; phrase * phraseBeats * beat < duration - .4; phrase++)
    melody(dst, phrase * phraseBeats * beat, beat, score[phrase % score.length], demo ? .042 : fast ? .075 : .085,
      demo ? 'triangle' : 'square', demo ? .08 : -.15);
  for (let b = 0; b * beat < duration; b++) {
    const at = b * beat, chord = chords[Math.floor(b / (demo ? 8 : 4)) % 4];
    if (!demo || b % 2 === 0) tone(dst, at, beat * (demo ? 1.8 : .7), hz(chord[b % 2]), 'triangle', demo ? .045 : .14);
    if (demo) {
      tone(dst, at + beat * .5, beat * 1.2, hz(chord[2 + b % 2] + 12), 'triangle', .024, b % 2 ? -.32 : .32);
    } else {
      for (let n = 0; n < (fast ? 2 : 1); n++)
        tone(dst, at + n * beat / 2, beat * .3, hz(chord[(b + n) % 4] + 24), 'square', fast ? .028 : .032, .28, undefined, .25);
      tone(dst, at, .12, 95, 'triangle', b % 2 ? .04 : .14, 0, 42, .5, 3);
      if (b % 2) tone(dst, at, .13, 0, 'noise', .13, -.12, 0, .5, 4);
      tone(dst, at + beat / 2, .035, 0, 'noise', .06, .25, 0, .5, 5);
    }
  }
  // Fade to the separate name jingle, not a hard musical cut.
  for (let i = 0; i < dst.length / 2; i++) {
    const t = i / rate, fade = Math.max(0, Math.min(1, t / .08, (duration - t) / (demo ? 2 : .35)));
    dst[i * 2] *= fade; dst[i * 2 + 1] *= fade;
  }
  return dst;
}
function effect(name) {
  const lengths = { sword: .28, critical: .38, party: .58, level: .75, permission: .5, yes: .18, chest: .28 };
  const dst = buffer(lengths[name]);
  if (name === 'sword') {
    tone(dst, 0, .06, 0, 'noise', .19, -.25, 0, .5, 1);
    tone(dst, .06, .16, 420, 'triangle', .27, .15, 125, .5, 3);
    tone(dst, .06, .14, 0, 'noise', .27, .1, 0, .5, 4);
  } else if (name === 'critical') {
    tone(dst, 0, .22, 105, 'triangle', .3, 0, 38, .5, 3);
    tone(dst, 0, .16, 0, 'noise', .32, 0, 0, .5, 4);
    tone(dst, .035, .19, 1400, 'square', .1, .22, 410, .25, 3);
  } else if (name === 'party') {
    melody(dst, 0, .15, [[76,1],[81,2]], .14, 'square', -.35);
    melody(dst, .08, .15, [[79,1],[74,2]], .15, 'triangle', .35);
  } else if (name === 'level') {
    for (const [at, a, b] of [[0,76,83],[.16,81,88],[.34,79,86]]) {
      tone(dst, at, .17, hz(a), 'square', .11, -.22);
      tone(dst, at + .025, .21, hz(b), 'triangle', .17, .22);
    }
    tone(dst, .5, .23, hz(81), 'triangle', .12, 0, hz(76));
  } else if (name === 'permission') {
    tone(dst, 0, .12, 660, 'square', .17, 0);
    tone(dst, .22, .18, 520, 'square', .17, 0);
  } else if (name === 'yes') {
    tone(dst, 0, .1, 880, 'square', .13, 0, 1180, .25);
    tone(dst, .025, .12, 660, 'triangle', .16, 0, 980);
  } else if (name === 'chest') {
    tone(dst, 0, .06, 0, 'noise', .2, 0, 0, .5, 4);
    melody(dst, .03, .065, [[86,1],[81,1],[89,1]], .15, 'triangle', .2);
  }
  return dst;
}
function add(dst, src, at, gain = 1) {
  const offset = Math.round(at * rate) * 2;
  for (let i = 0; i < src.length && offset + i < dst.length; i++) dst[offset + i] += src[i] * gain;
}
function jingle(kind) {
  const dst = buffer(3.6), fast = kind === 'bright', transpose = fast ? 0 : -12;
  const pitches = [83,77,81,86,79,81], lengths = fast ? [.16,.24,.16,.4,.35,.66] : [.22,.3,.22,.5,.4,.76];
  let at = 0;
  pitches.forEach((pitch, i) => { tone(dst, at, lengths[i] * .94, hz(pitch + transpose), 'square', .105, -.12); at += lengths[i]; });
  for (const pitch of fast ? [53,60,64,71] : [50,57,60,64])
    tone(dst, 0, 3.4, hz(pitch), 'triangle', .047, .15, undefined, .5, .5, .05, .7);
  return dst;
}
function wav(path, samples) {
  const peak = samples.reduce((p, v) => Math.max(p, Math.abs(v)), 0);
  if (!Number.isFinite(peak) || peak >= .98) throw new Error(`Unsafe PCM peak ${peak}: ${path}`);
  const bytes = samples.length * 2, data = Buffer.alloc(44 + bytes);
  data.write('RIFF'); data.writeUInt32LE(36 + bytes, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 4, 28); data.writeUInt16LE(4, 32);
  data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(bytes, 40);
  samples.forEach((sample, i) => data.writeInt16LE(Math.round(sample * 32767), 44 + i * 2));
  writeFileSync(path, data); return { peakDbfs: 20 * Math.log10(peak), duration: samples.length / (rate * 2) };
}
function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-y', ...args], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message);
  return result.stderr;
}
function measure(path, target) {
  const log = ffmpeg(['-i', path, '-vn', '-af', `loudnorm=I=${target}:TP=-2:LRA=7:print_format=json`, '-f', 'null', '-']);
  return JSON.parse(log.match(/\{\s*"input_i"[\s\S]*?\}/)[0]);
}
function normalize(raw, path, target) {
  const m = measure(raw, target);
  ffmpeg(['-i', raw, '-af', `loudnorm=I=${target}:TP=-2:LRA=7:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`,
    '-ar', String(rate), '-ac', '2', '-c:a', 'pcm_s16le', path]);
  const measured = measure(path, target);
  if (Math.abs(Number(measured.input_i) - target) > .5 || Number(measured.input_tp) > -1)
    throw new Error(`Loudness/true-peak failed: ${path}`);
  return { targetLufs: target, integratedLufs: Number(measured.input_i), truePeakDbtp: Number(measured.input_tp), lra: Number(measured.input_lra) };
}
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
mkdirSync(join(output, 'sfx'), { recursive: true });
const temp = mkdtempSync(join(tmpdir(), 'agent-quest-audio-'));
const evidence = { sourceSha256: {}, sampleRate: rate, channels: 2, cues, nameJingleAt: ending + .3, sfx: {}, masters: {}, previews: {} };
try {
  for (const file of ['promo-ja-16x9.mp4', 'promo-ja-16x9.proof.json', 'retake-proof.json']) evidence.sourceSha256[file] = sha(join(source, file));
  const effects = buffer(seconds), library = {};
  for (const name of new Set(cues.map((cue) => cue.sound))) {
    library[name] = effect(name);
    evidence.sfx[name] = wav(join(output, 'sfx', `${name}.wav`), library[name]);
  }
  for (const cue of cues) add(effects, library[cue.sound], cue.at);
  wav(join(output, 'promo-effects.wav'), effects);
  for (const kind of ['bright', 'march', 'quiet']) {
    const samples = music(kind), demo = kind === 'quiet', name = demo ? 'demo-quiet' : `promo-${kind}`;
    if (!demo) {
      for (let i = 0; i < samples.length / 2; i++) {
        const t = i / rate; let duck = 1;
        for (const cue of cues) {
          const end = cue.at + (cue.sound === 'permission' ? event(38) - cue.at : evidence.sfx[cue.sound].duration);
          const strength = Math.max(0, Math.min(1, (t - cue.at + .045) / .045, (end + .18 - t) / .18));
          duck = Math.min(duck, 1 - strength * .65);
        }
        samples[i * 2] *= duck; samples[i * 2 + 1] *= duck;
      }
      add(samples, effects, 0);
      const brand = jingle(kind); wav(join(output, `name-${kind}.wav`), brand); add(samples, brand, ending + .3);
    }
    const raw = join(temp, `${name}.wav`), master = join(output, `${name}.wav`), target = demo ? -23 : -16;
    wav(raw, samples); evidence.masters[`${name}.wav`] = normalize(raw, master, target);
    if (!demo) {
      const video = join(output, `promo-ja-16x9-${kind}.mp4`);
      ffmpeg(['-i', join(source, 'promo-ja-16x9.mp4'), '-i', master, '-map', '0:v:0', '-map', '1:a:0',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(seconds), '-movflags', '+faststart', video]);
      const streams = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', video])).streams;
      const m = measure(video, -16);
      if (Number(m.input_tp) > -1 || Math.abs(Number(m.input_i) + 16) > .5) throw new Error('AAC loudness failed');
      evidence.previews[video.split('/').at(-1)] = { streams: streams.map(({ codec_name, codec_type, duration, nb_frames, width, height }) =>
        ({ codec_name, codec_type, duration, nb_frames, width, height })), integratedLufs: Number(m.input_i), truePeakDbtp: Number(m.input_tp) };
    }
    console.log(`${name}: ${JSON.stringify(evidence.masters[`${name}.wav`])}`);
  }
  for (const [file, hash] of Object.entries(evidence.sourceSha256)) if (sha(join(source, file)) !== hash) throw new Error(`Source changed: ${file}`);
  writeFileSync(join(output, 'audio-proof.json'), JSON.stringify(evidence, null, 2) + '\n');
} finally { rmSync(temp, { recursive: true, force: true }); }
