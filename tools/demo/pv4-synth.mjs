// Small PV-only oscillator, adapted from audio.mjs. No app audio or dependencies.
export const rate = 48000, initialSeed = 0x88a57a;
let seed = initialSeed;
export const buffer = seconds => new Float32Array(Math.round(seconds * rate) * 2);
export const hz = midi => 440 * 2 ** ((midi - 69) / 12);
function blep(p, step) {
  if (p < step) { const x = p / step; return 2 * x - x * x - 1; }
  if (p > 1 - step) { const x = (p - 1) / step; return x * x + 2 * x + 1; }
  return 0;
}
export function tone(dst, at, duration, f, wave, gain, pan = 0, end = f, duty = .5, decay = .6, attack = .005, release = .03) {
  if (at < 0 || duration < attack + release || (wave !== 'noise' && f <= 0)) throw Error('Invalid voice envelope/pitch');
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
    else value = (phase < duty ? 1 : -1) - (2 * duty - 1) + blep(phase, step) - blep((phase - duty + 1) % 1, step);
    const envelope = Math.max(0, Math.min(1, t / attack, (duration - t) / release)) * Math.exp(-decay * t / duration);
    const offset = (start + i) * 2, valueOut = value * gain * envelope;
    dst[offset] += valueOut * left; dst[offset + 1] += valueOut * right;
  }
}
export function add(dst, src, at) {
  const offset = Math.round(at * rate) * 2;
  if (offset < 0 || offset + src.length > dst.length) throw Error('Out-of-range placement');
  for (let i = 0; i < src.length; i++) dst[offset + i] += src[i];
}
export function fade(dst, start, end, duration) {
  for (let i = Math.round(start * rate); i < Math.round(end * rate); i++) {
    const g = Math.max(0, Math.min(1, (end - i / rate) / duration));
    dst[i * 2] *= g; dst[i * 2 + 1] *= g;
  }
}
