// Numerical audition support, not AI training: PCM envelopes, tempo candidates, dynamics.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const root = process.argv[2] ?? '.art-work/s87';
const results = [];
for (const n of ['06', '11', '13']) {
  const file = `${root}/audio/maoudamashii-fantasy${n}.mp3`;
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', '8000', '-f', 'f32le', '-'], { maxBuffer: 12e6 });
  const pcm = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4), rms = [], onsets = [];
  for (let i = 0; i + 80 < pcm.length; i += 80) {
    let sum = 0; for (let j = i; j < i + 80; j++) sum += pcm[j] ** 2;
    rms.push(Math.sqrt(sum / 80));
  }
  for (let i = 0; i < rms.length; i++) onsets.push(Math.max(0, rms[i] - (rms[i - 2] ?? 0)));
  const scores = [];
  for (let bpm = 70; bpm <= 180; bpm += 0.1) {
    const lag = 6000 / bpm; let score = 0;
    for (let i = 300; i < Math.min(onsets.length, 7500) - lag; i++) {
      const k = i + lag, a = Math.floor(k), p = k - a;
      score += onsets[i] * ((1 - p) * onsets[a] + p * onsets[a + 1]);
    }
    scores.push({ bpm: +bpm.toFixed(1), score });
  }
  scores.sort((a, b) => b.score - a.score);
  const tempos = scores.filter((s, i) => !scores.slice(0, i).some(t => Math.abs(t.bpm - s.bpm) < 3)).slice(0, 6);
  const zones = [];
  for (let i = 0; i < rms.length; i += 200) {
    const a = rms.slice(i, i + 200); zones.push({ start: i / 100, rms: +Math.sqrt(a.reduce((n, v) => n + v * v, 0) / a.length).toFixed(4) });
  }
  const peaks = onsets.map((v, i) => ({ time: i / 100, strength: v })).filter((s, i) => s.strength > 0.012 && s.strength >= (onsets[i - 1] ?? 0) && s.strength > (onsets[i + 1] ?? 0));
  const grid = [];
  for (const { bpm } of tempos) {
    const beat = 60 / bpm;
    for (let phase = 0; phase < beat; phase += 0.01) {
      const score = peaks.filter(s => s.time > 8 && s.time < 85).reduce((sum, s) => {
        const d = Math.abs((s.time - phase) / beat - Math.round((s.time - phase) / beat)) * beat;
        return sum + s.strength * Math.exp(-d * d / 0.0008);
      }, 0);
      grid.push({ bpm, phase: +phase.toFixed(3), score });
    }
  }
  grid.sort((a, b) => b.score - a.score);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-filter_complex', 'showwavespic=s=1800x300:colors=0xffe066', '-frames:v', '1', `${root}/audio/wave-fantasy${n}.png`]);
  results.push({ track: n, seconds: pcm.length / 8000, tempoCandidates: tempos, gridCandidates: grid.slice(0, 5), zones, peaks });
  console.log(n, tempos, grid.slice(0, 2), 'strongest', [...zones].sort((a, b) => b.rms - a.rms).slice(0, 8));
}
writeFileSync(`${root}/audio/analysis.json`, JSON.stringify(results, null, 2) + '\n');
