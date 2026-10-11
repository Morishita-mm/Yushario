// Offline PV4 audio build. Acquire official SE through their material pages first;
// sources/assets.json and MP3s stay ignored/private, never bundled or redistributed.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buffer, rate, add, initialSeed } from './pv4-synth.mjs';
import { renderMusic } from './pv4-music.mjs';
import { ffmpeg,decode,wav,stats,sha,json,loudness } from './pv4-audio-io.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),base=join(root,'.art-work/s88'),out=join(base,'audio');
mkdirSync(join(out,'processed'),{recursive:true});mkdirSync(join(out,'qa'),{recursive:true});
const cuePath=join(base,'video/cues.json'),cues=JSON.parse(readFileSync(cuePath));
if(cues.version!==4||cues.fps!==30)throw Error('Review new cue format');
const assets=JSON.parse(readFileSync(join(out,'sources/assets.json')));
const recipes = {
  sword: {crop:.02,length:.30,peakDb:-22,filter:'highpass=f=100,equalizer=f=2500:t=q:w=1:g=-1'},
  chest: {crop:.01,length:.32,peakDb:-24,filter:'highpass=f=100'},
  // R1/R3: resample the 44.1kHz source before -2 semitones; retain only its first
  // strike before the second attack, with gentle EQ rather than two narrow bands.
  level: {crop:.004,sourceEnd:.045,length:.0460213,fadeOut:.008,peakDb:-26,processingRate:48000,asRate:42763.1385,
    filter:'aresample=48000,highpass=f=100,equalizer=f=5500:t=q:w=0.7:g=-3,asetrate=42763.1385,aresample=48000'},
};
const library={}, processing={};
for(const [key,r] of Object.entries(recipes)) {
  const original=join(out,'sources',`${key}.mp3`),asset=assets.find(a=>a.key===key);
  if(sha(original)!==asset.sourceSha256)throw Error(`Source hash changed: ${key}`);
  const sourceRate=+JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=sample_rate','-of','json',original])).streams[0].sample_rate;
  const fadeOut=r.fadeOut??.035;
  const trimmed=decode(original,`atrim=start=${r.crop}${r.sourceEnd?`:end=${r.sourceEnd}`:''},asetpts=PTS-STARTPTS,${r.filter},atrim=duration=${r.length},afade=t=in:d=0.003,afade=t=out:st=${r.length-fadeOut}:d=${fadeOut}`);
  const gain=10**(r.peakDb/20)/stats(trimmed).peak;
  for(let i=0;i<trimmed.length;i++)trimmed[i]*=gain;
  // Blade impact is the main 5ms RMS transient; the latch uses only its first
  // 55ms cluster. A notice is anchored to onset, not its slow ringing peak.
  let best=0,impact=0;
  for(let i=0;i<trimmed.length-480;i+=48) {
    if(key==='chest'&&i/(rate*2)>.055)break;
    let energy=0;for(let j=i;j<i+480;j++)energy+=trimmed[j]*trimmed[j];
    if(energy>best){best=energy;impact=(i+240)/(rate*2);}
  }
  if(key==='level') {
    const threshold=stats(trimmed).peak*.1;
    impact=trimmed.findIndex(v=>Math.abs(v)>=threshold)/(rate*2);
  }
  library[key]=trimmed;
  processing[key]={...asset,...r,sourceRate,outputRate:rate,gain,processedDuration:trimmed.length/(rate*2),impactOffset:impact,
    impactDefinition:key==='level'?'first 10%-of-peak amplitude crossing: notice onset':key==='chest'?'centre of strongest 5ms RMS in initial 55ms latch cluster':'centre of strongest 5ms RMS: blade impact',
    stats:wav(join(out,'processed',`${key}.wav`),trimmed)};
}
const keyFor={'sword-contact':'sword','level-up':'level','chest-open':'chest'};
const effects=cues.effects.filter(e=>keyFor[e.kind]).map(e=>({ ...e,key:keyFor[e.kind],
  origin:e.kind==='sword-contact'?'recorded application contact':e.kind==='level-up'?'real Lv DOM notice':'real unread-badge click / report dialog',
  duration:processing[keyFor[e.kind]].processedDuration,impactOffset:processing[keyFor[e.kind]].impactOffset,
  placeAt:e.time-processing[keyFor[e.kind]].impactOffset }));
if(new Set(effects.map(e=>e.id)).size!==effects.length)throw Error('Duplicate effect');
const se=buffer(cues.duration);
for(const e of effects)add(se,library[e.key],e.placeAt);
wav(join(out,'se.wav'),se);
const music=renderMusic(cues,effects);
// Gentle BGM-only 1–4kHz cleanup; no blanket bandlimit or SE homogenisation.
const bgmPath=join(out,'bgm-dry.wav');wav(bgmPath,music.samples);
ffmpeg(['-i',bgmPath,'-af','equalizer=f=2200:t=q:w=.8:g=-1.5','-c:a','pcm_f32le',join(out,'bgm.wav')]);
ffmpeg(['-i',join(out,'bgm.wav'),'-i',join(out,'se.wav'),'-filter_complex','[0:a][1:a]amix=inputs=2:normalize=0:duration=longest','-c:a','pcm_f32le',join(out,'mix-float.wav')]);
const floatStats=stats(decode(join(out,'mix-float.wav')));
if(floatStats.nonfinite||floatStats.fullscale||Math.abs(floatStats.dc)>=.002)throw Error('Float mix failed');
const first=loudness(join(out,'mix-float.wav'));
const secondLog=ffmpeg(['-i',join(out,'mix-float.wav'),'-af',`loudnorm=I=-15.8:TP=-2:LRA=20:measured_I=${first.input_i}:measured_TP=${first.input_tp}:measured_LRA=${first.input_lra}:measured_thresh=${first.input_thresh}:offset=${first.target_offset}:linear=true:print_format=json`,
  '-ar','48000','-ac','2','-c:a','pcm_s24le',join(out,'master.wav')]);
writeFileSync(join(out,'qa/mastering-second-pass.txt'),secondLog);
const second=JSON.parse(secondLog.match(/\{\s*"input_i"[\s\S]*?\}/)[0]);
const master=loudness(join(out,'master.wav'));
if(+master.input_tp>-2 || +master.input_i < -16 || +master.input_i > -14)throw Error(`Master failed: ${JSON.stringify(master)}`);
ffmpeg(['-i',join(out,'master.wav'),'-c:a','aac','-b:a','192k',join(out,'master.m4a')]);
const sources={},outputs={};
for(const variant of cues.variants) {
  const source=join(base,'video',`pv4-${variant}.mp4`),dest=join(base,`pv4a-${variant}.mp4`);
  sources[variant]=sha(source);
  ffmpeg(['-i',source,'-i',join(out,'master.m4a'),'-map','0:v:0','-map','1:a:0','-c','copy','-t',String(cues.duration),'-movflags','+faststart',dest]);
  outputs[variant]={sha256:sha(dest),loudness:loudness(dest)};
}
const evidence={version:4,cuesSha256:sha(cuePath),sampleRate:rate,seed:initialSeed,duration:cues.duration,
  sourceVideos:sources,outputs,processing,effects,omissions:cues.effects.filter(e=>!keyFor[e.kind]).map(e=>({...e,reason:e.kind==='flash'?'multi-pitch/glissando conflicts with title; omit per design':e.kind==='report-arrival'?'optional wood mallet omitted; BGM provides arrival':e.kind==='party-reveal'?'editorial pullback, not new party event; bass returns':'BGM downbeat, not SE'})),
  groups:music.groups,bars:music.bars,notes:music.notes,guards:music.guards,biomeChanges:music.biomeChanges,omittedArps:music.omittedArps,floatStats,normalization:{first,second,master,target:-15.8,truePeakTarget:-2,passes:2},
  credits:{maoudamashiiUsed:false,originalVideoHasOldCredit:false,required:false,decision:'No credit overlay: original ending contains no music attribution, official Lab credits optional; report provides attribution.'}};
json(join(out,'audio-proof.json'),evidence);
const rows=[
  ...cues.scenes.map(s=>['scene',s.id,s.start,s.end,s.kind,'video',s.startFrame,s.endFrame,'','','']),
  ...music.bars.map(b=>['bar',b.group,b.start,Math.min(b.end,cues.duration),b.phrase,'music',b.bar,b.beats,b.bpm,'',JSON.stringify(b.chord)]),
  ...music.notes.map(n=>['note',n.group,n.start,n.end,n.midi,`${n.role}/${n.wave}`,n.bar,n.beat,n.gain,'',JSON.stringify(music.bars.find(b=>n.start>=b.start&&n.start<b.end)?.chord??[])]),
  ...effects.map(e=>['SE',e.id,e.placeAt,e.placeAt+e.duration,processing[e.key].name,e.key,e.time,e.impactOffset,processing[e.key].peakDb,e.origin,processing[e.key].page]),
].sort((a,b)=>a[2]-b[2]);
writeFileSync(join(out,'cue-sheet.tsv'),['type\tid/group\tstart\tend\tmidi/material\tinstrument\tbar/anchor\tbeat/offset\tgain/bpm\torigin\tchord/page',...rows.map(r=>r.join('\t'))].join('\n')+'\n');
console.log(JSON.stringify({master,outputs,effects:effects.map(({id,time,placeAt})=>({id,time,placeAt}))},null,2));
