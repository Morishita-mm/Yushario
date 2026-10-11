// Offline only: reuses the approved s88 processed effects without changing them.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buffer, rate, add, initialSeed } from './pv4-synth.mjs';
import { renderMusic } from './pv5-music.mjs';
import { ffmpeg, decode, wav, stats, sha, json, loudness } from './pv4-audio-io.mjs';
import { cueHash, duration } from '../../.art-work/s89/score.mjs';
const variant=process.argv[2];if(!['A','B'].includes(variant))throw Error('Run separately: node tools/demo/pv5-audio.mjs A (or B)');
const root=fileURLToPath(new URL('../../',import.meta.url)),old=join(root,'.art-work/s88'),base=join(root,'.art-work/s89');
const out=join(base,'audio',variant.toLowerCase()),qa=join(base,'qa',variant.toLowerCase());
mkdirSync(out,{recursive:true});mkdirSync(qa,{recursive:true});
const cuePath=join(old,'video/cues.json'),cues=JSON.parse(readFileSync(cuePath));
if(sha(cuePath)!==cueHash||cues.duration!==duration||cues.fps!==30)throw Error('Cues changed');
const previous=JSON.parse(readFileSync(join(old,'audio/audio-proof.json'))),keyFor={'sword-contact':'sword','level-up':'level','chest-open':'chest'};
const effects=cues.effects.filter(e=>keyFor[e.kind]).map(e=>{
  const prev=previous.effects.find(p=>p.id===e.id);
  if(!prev||prev.time!==e.time||prev.frame!==e.frame||prev.key!==keyFor[e.kind])throw Error(`SE anchor changed ${e.id}`);
  return {...e,key:prev.key,placeAt:prev.placeAt,impactOffset:prev.impactOffset,duration:prev.duration};
});
if(effects.length!==7||new Set(effects.map(e=>e.id)).size!==7)throw Error('Exactly seven existing effects');
const processing={},library={};
for(const key of ['sword','level','chest']) {
  const path=join(old,'audio/processed',`${key}.wav`),p=previous.processing[key];
  const samples=decode(path);library[key]=samples;
  if(samples.length/96000!==p.processedDuration)throw Error(`Processed SE duration ${key}`);
  processing[key]={path,sha256:sha(path),name:p.name,page:p.page,stats:stats(samples),impactOffset:p.impactOffset,impactDefinition:p.impactDefinition};
}
const se=buffer(duration);for(const e of effects)add(se,library[e.key],e.placeAt);
const sePath=join(out,'se.wav');wav(sePath,se);
// PCM, not container-header, identity with the preceding approved SE stem.
const oldSe=decode(join(old,'audio/se.wav'));
if(oldSe.length!==se.length||oldSe.some((v,i)=>v!==se[i]))throw Error('SE stem differs from v4-M2');
const music=renderMusic(variant,cues,effects);
for(const [role,samples] of Object.entries(music.stems))wav(join(out,`${role}-dry.wav`),samples);
const dry=join(out,'bgm-dry.wav'),bgm=join(out,'bgm.wav'),mix=join(out,'mix-float.wav');
wav(dry,music.samples);
ffmpeg(['-i',dry,'-af','equalizer=f=2200:t=q:w=.8:g=-1.5','-c:a','pcm_f32le',bgm]);
ffmpeg(['-i',bgm,'-i',sePath,'-filter_complex','[0:a][1:a]amix=inputs=2:normalize=0:duration=longest','-c:a','pcm_f32le',mix]);
const floatStats=stats(decode(mix));
if(floatStats.nonfinite||floatStats.fullscale||Math.abs(floatStats.dc)>=.002)throw Error('Unsafe float mix');
const first=loudness(mix),target=-15.85,linearGainDb=target-(+first.input_i);
// Measure -> ONE constant whole-program gain -> remeasure, without a limiter.
// loudnorm's measured target_offset comes from its dynamic preview, not a scalar gain.
if(+first.input_tp+linearGainDb>-2)throw Error(`Reduce transient crest in the arrangement: ${+first.input_tp+linearGainDb} dBTP`);
const secondLog=ffmpeg(['-i',mix,'-af',`volume=${linearGainDb}dB`,
  '-ar','48000','-ac','2','-c:a','pcm_s24le',join(out,'master.wav')]);
writeFileSync(join(qa,'mastering-second-pass.txt'),secondLog);
const second={normalization_type:'linear',filter:`volume=${linearGainDb}dB`,limiter:false},master=loudness(join(out,'master.wav'));
if(+master.input_tp>-2||+master.input_i < -16||+master.input_i > -14)throw Error(`Master failed ${JSON.stringify(master)}`);
ffmpeg(['-i',join(out,'master.wav'),'-c:a','aac','-b:a','192k',join(out,'master.m4a')]);
const outputs={},sourceVideos={};
for(const version of cues.variants) {
  const source=join(old,'video',`pv4-${version}.mp4`),dest=join(base,`pv5${variant.toLowerCase()}-${version}.mp4`);
  sourceVideos[version]=sha(source);
  ffmpeg(['-i',source,'-i',join(out,'master.m4a'),'-map','0:v:0','-map','1:a:0','-c','copy','-t',String(duration),'-movflags','+faststart',dest]);
  outputs[version]={path:dest,sha256:sha(dest),loudness:loudness(dest)};
}
const evidence={variant,duration,sampleRate:rate,seed:initialSeed,cuesSha256:cueHash,scoreSha256:sha(join(base,'score.mjs')),
  sourceVideos,outputs,effects,processing,sePcmIdenticalToV4:true,notes:music.notes,bars:music.bars,guards:music.guards,
  omittedArps:music.omittedArps,biomeChanges:music.biomeChanges,refinements:music.refinements,floatStats,
  normalization:{first,second,master,target,truePeakTarget:-2,linearGainDb},
  credits:{bgm:variant==='A'?'Original 8-bit arrangement (astra S8.9)':'Original 8-bit arrangement; melody excerpt from Beethoven, Symphony No. 9, Op. 125, IV',
    sfx:'効果音ラボ / Sound Effect Lab',humanListening:false}};
json(join(out,'audio-proof.json'),evidence);
const rows=[...music.bars.map(b=>['bar',b.phrase,b.start,b.end,b.bar,b.bpm,b.beats,JSON.stringify(b.chord)]),
  ...music.notes.map(n=>['note',n.role,n.start,n.end,n.midi,n.frequency,n.gain,n.style]),
  ...effects.map(e=>['SE',e.id,e.placeAt,e.placeAt+e.duration,e.key,e.time,e.impactOffset,processing[e.key].page])].sort((a,b)=>a[2]-b[2]);
writeFileSync(join(out,'cue-sheet.tsv'),['type\trole/phrase/id\tstart\tend\tbar/midi/key\tbpm/hz/anchor\tbeats/gain/offset\tchord/style/page',...rows.map(r=>r.join('\t'))].join('\n')+'\n');
console.log(JSON.stringify({variant,notes:music.notes.length,master,second,outputs},null,2));
