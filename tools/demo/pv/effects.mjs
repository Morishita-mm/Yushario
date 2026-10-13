// Offline effect preparation. Original and processed samples must stay private.
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buffer, rate, add } from './synth.mjs';
import { decode, wav, stats, sha, json } from './audio-io.mjs';
const base = resolve('.art-work/pv'), out = join(base, 'audio');
mkdirSync(join(out, 'processed'), { recursive: true });
const cues = JSON.parse(readFileSync(join(base, 'video/cues.json')));
const assets = JSON.parse(readFileSync(join(out, 'sources/assets.json')));
const recipes = {
  sword: {crop:.02,length:.30,peakDb:-22,filter:'highpass=f=100,equalizer=f=2500:t=q:w=1:g=-1'},
  chest: {crop:.01,length:.32,peakDb:-24,filter:'highpass=f=100'},
  level: {crop:.004,sourceEnd:.045,length:.0460213,fadeOut:.008,peakDb:-26,processingRate:48000,asRate:42763.1385,
    filter:'aresample=48000,highpass=f=100,equalizer=f=5500:t=q:w=0.7:g=-3,asetrate=42763.1385,aresample=48000'},
};
const library = {}, processing = {};
for (const [key, r] of Object.entries(recipes)) {
  const original = join(out, 'sources', `${key}.mp3`), asset = assets.find(a => a.key === key);
  if (!asset || sha(original) !== asset.sourceSha256) throw Error(`Source hash changed: ${key}`);
  const sourceRate = +JSON.parse(execFileSync('ffprobe', ['-v','error','-show_entries','stream=sample_rate','-of','json',original])).streams[0].sample_rate;
  const fadeOut = r.fadeOut ?? .035;
  const trimmed = decode(original, `atrim=start=${r.crop}${r.sourceEnd ? `:end=${r.sourceEnd}` : ''},asetpts=PTS-STARTPTS,${r.filter},atrim=duration=${r.length},afade=t=in:d=0.003,afade=t=out:st=${r.length-fadeOut}:d=${fadeOut}`);
  const gain = 10**(r.peakDb/20)/stats(trimmed).peak;
  for (let i=0;i<trimmed.length;i++) trimmed[i] *= gain;
  let best=0, impact=0;
  for (let i=0;i<trimmed.length-480;i+=48) {
    if (key==='chest' && i/(rate*2)>.055) break;
    let energy=0; for (let j=i;j<i+480;j++) energy += trimmed[j]*trimmed[j];
    if (energy>best) { best=energy; impact=(i+240)/(rate*2); }
  }
  if (key==='level') {
    const threshold=stats(trimmed).peak*.1;
    impact=trimmed.findIndex(v=>Math.abs(v)>=threshold)/(rate*2);
  }
  library[key]=trimmed;
  processing[key]={...asset,...r,sourceRate,outputRate:rate,gain,processedDuration:trimmed.length/(rate*2),impactOffset:impact,
    impactDefinition:key==='level'?'first 10%-of-peak amplitude crossing: notice onset':key==='chest'?'centre of strongest 5ms RMS in initial 55ms latch cluster':'centre of strongest 5ms RMS: blade impact',
    stats:wav(join(out,'processed',`${key}.wav`),trimmed)};
}
const keyFor={'sword-contact':'sword','level-up':'level','chest-open':'chest'};
const effects=cues.effects.filter(e=>keyFor[e.kind]).map(e=>({...e,key:keyFor[e.kind],
  duration:processing[keyFor[e.kind]].processedDuration,impactOffset:processing[keyFor[e.kind]].impactOffset,
  placeAt:e.time-processing[keyFor[e.kind]].impactOffset}));
if (effects.length!==7 || new Set(effects.map(e=>e.id)).size!==7) throw Error('Exactly seven effects required');
const se=buffer(cues.duration);
for (const e of effects) add(se,library[e.key],e.placeAt);
wav(join(out,'se.wav'),se);
json(join(out,'effects-proof.json'),{effects,processing,cuesSha256:sha(join(base,'video/cues.json'))});
console.log('Three effects prepared at seven unchanged cue anchors. Keep all sample files private.');
