// Completed-file numerical and visual diagnostics only, never a listening claim.
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { score } from './pv4-score.mjs';
import { ffmpeg,decode,stats,json,sha } from './pv4-audio-io.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),base=join(root,'.art-work/s88'),audio=join(base,'audio'),qa=join(audio,'qa');
mkdirSync(qa,{recursive:true});
const proof=JSON.parse(readFileSync(join(audio,'audio-proof.json'))),cues=JSON.parse(readFileSync(join(base,'video/cues.json')));
const check=(ok,message)=>{if(!ok)throw Error(message);};
check(sha(join(base,'video/cues.json'))===proof.cuesSha256,'Cues changed');
const scoreChecks=[];
for(const [name,s] of Object.entries(score)) {
  for(const role of ['lead','bass']) {
    const lines=s.beats?[s[role]]:s[role];
    lines.forEach((line,bar)=>{
      const beats=line.reduce((sum,n)=>sum+n[1],0),pitches=line.map(n=>n[0]).filter(Boolean);
      check(beats===(s.beats??4),`${name}/${role}/${bar} beat count`);
      check(pitches.every(n=>[0,2,4,5,7,9,11].includes(n%12)),`${name} out-of-scale`);
      scoreChecks.push({name,role,bar,beats,pitches});
    });
  }
  check(s.arp.flat().every(n=>[0,2,4,5,7,9,11].includes(n%12)),`${name} arp scale`);
  if(s.arpNotes) {
    check(s.arpNotes.reduce((sum,n)=>sum+n[1],0)===s.beats,`${name} explicit arp beats`);
    check(s.arpNotes.every(([n])=>!n||[0,2,4,5,7,9,11].includes(n%12)),`${name} explicit arp scale`);
  }
}
for(const n of proof.notes) check(n.start>=0&&n.end<=cues.duration&&n.end-n.start>=n.attack+n.release,`Voice range/envelope ${JSON.stringify(n)}`);
for(const e of proof.effects) check(e.placeAt>=0&&e.placeAt+e.duration<=cues.duration&&Math.abs(e.time-e.frame/30)<1e-9,`SE range/frame ${e.id}`);
const tonal=proof.notes.filter(n=>['lead','bass','arp'].includes(n.role)),semitones=[],tritones=[];
for(let i=0;i<tonal.length;i++)for(let j=i+1;j<tonal.length;j++) {
  const a=tonal[i],b=tonal[j],overlap=Math.min(a.end,b.end)-Math.max(a.start,b.start);
  if(overlap<=0)continue;
  const row={a:{group:a.group,role:a.role,midi:a.midi},b:{group:b.group,role:b.role,midi:b.midi},start:Math.max(a.start,b.start),seconds:overlap};
  if(Math.abs(a.midi-b.midi)===1)semitones.push(row);
  if([a.midi%12,b.midi%12].sort((x,y)=>x-y).join(',')==='5,11')tritones.push(row);
}
check(!semitones.some(r=>r.seconds>.150001),'Sustained adjacent-register semitone; review arp');
const joins=proof.groups.slice(1).map((g,i)=>{
  const prev=proof.groups[i],last=tonal.filter(n=>n.start>=prev.start&&n.end<=prev.end).sort((a,b)=>b.end-a.end)[0];
  const first=tonal.filter(n=>n.start>=g.start&&n.start<g.end).sort((a,b)=>a.start-b.start)[0];
  return {at:g.start,from:prev.name,to:g.name,outMidi:last?.midi,inMidi:first?.midi,key:g.key,bpm:score[g.name].bpm,
    gap:g.start-prev.end,gridResidualBeats:(g.start-prev.start)/(60/score[prev.name].bpm),note:'Cue-aligned downbeat; shared scale; no release overlaps new group'};
});
const loops=proof.bars.filter((b,i)=>i&&proof.bars[i-1].group===b.group&&b.bar===0).map(b=>({at:b.start,group:b.group,bar:b.bar,bpm:b.bpm,chord:b.chord}));
json(join(qa,'score-and-joins.json'),{scoreChecks,semitones,tritones,joins,loops,endingRestShortenedBy:.1});
const final=join(base,'pv4a-ja-16x9.mp4'),decoded=join(qa,'final-decoded.wav');
ffmpeg(['-i',final,'-vn','-ar','48000','-ac','2','-c:a','pcm_f32le',decoded]);
const pcm=decode(decoded),bgm=decode(join(audio,'bgm.wav')),se=decode(join(audio,'se.wav'));
const variants=[];
for(const variant of cues.variants) {
  const file=join(base,`pv4a-${variant}.mp4`),source=join(base,'video',`pv4-${variant}.mp4`);
  const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file]));
  const streams=info.streams,video=streams.find(s=>s.codec_type==='video'),aud=streams.filter(s=>s.codec_type==='audio');
  check(aud.length===1&&aud[0].codec_name==='aac'&&aud[0].sample_rate==='48000'&&aud[0].channels===2,`${variant} audio`);
  check(+video.nb_frames===1485&&+video.duration===cues.duration&&video.start_time==='0.000000'&&aud[0].start_time==='0.000000',`${variant} PTS/length`);
  const data=decode(file),pcmHash=createHash('sha256').update(Buffer.from(data.buffer)).digest('hex');
  // ffmpeg's hash muxer writes stdout, so use execFileSync for packet checks.
  const packetHash=p=>execFileSync('ffmpeg',['-v','error','-i',p,'-map','0:v:0','-c','copy','-f','hash','-hash','sha256','-'],{encoding:'utf8'}).trim();
  check(packetHash(file)===packetHash(source),`${variant} picture changed`);
  check(sha(source)===proof.sourceVideos[variant],`${variant} source changed`);
  const measure=proof.outputs[variant].loudness;
  check(+measure.input_i>=-16&&+measure.input_i<=-14&&+measure.input_tp<=-1.5,`${variant} loudness`);
  const ending=join(qa,`ending-${variant}.png`);
  ffmpeg(['-i',file,'-vf','select=eq(n\\,1470)','-frames:v','1',ending]);
  variants.push({variant,pcmHash,packetVideoHash:packetHash(file),startTime:aud[0].start_time,audioDuration:aud[0].duration,
    videoDuration:video.duration,frames:video.nb_frames,lufs:+measure.input_i,truePeak:+measure.input_tp,stats:stats(data),ending});
}
check(new Set(variants.map(v=>v.pcmHash)).size===1,'Different four-version audio');
for(const v of variants)check(!v.stats.nonfinite&&!v.stats.fullscale&&Math.abs(v.stats.dc)<.002,`${v.variant} PCM unsafe`);
writeFileSync(join(qa,'ebur128.txt'),ffmpeg(['-i',decoded,'-af','ebur128=peak=true','-f','null','-']));
writeFileSync(join(qa,'astats.txt'),ffmpeg(['-i',decoded,'-af','astats=metadata=1:reset=0','-f','null','-']));
// Parseval-normalized FFT of Hann-windowed stereo, no external numerical packages.
function bands(a,at) {
  const count=9600,N=16384,energy=[0,0,0];let w2=0;
  for(let ch=0;ch<2;ch++) {
    const re=new Float64Array(N),im=new Float64Array(N);let weight=0;
    for(let i=0;i<count;i++) { const w=.5-.5*Math.cos(2*Math.PI*i/(count-1));re[i]=a[(Math.round((at-.1)*48000)+i)*2+ch]*w;weight+=w*w; }
    w2=weight;
    for(let i=1,j=0;i<N;i++){let bit=N>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];}}
    for(let len=2;len<=N;len*=2)for(let at=0;at<N;at+=len)for(let j=0;j<len/2;j++) {
      const angle=-2*Math.PI*j/len,c=Math.cos(angle),s=Math.sin(angle),k=at+j,l=k+len/2;
      const r=re[l]*c-im[l]*s,m=re[l]*s+im[l]*c;re[l]=re[k]-r;im[l]=im[k]-m;re[k]+=r;im[k]+=m;
    }
    for(let k=1;k<N/2;k++) {
      const f=k*48000/N,b=f>=120&&f<500?0:f>=500&&f<2000?1:f>=2000&&f<6000?2:-1;
      if(b>=0)energy[b]+=2*(re[k]*re[k]+im[k]*im[k])/(N*weight*2);
    }
  }
  return energy.map(e=>10*Math.log10(e||1e-30));
}
const bandRms=proof.effects.map(e=>{
  const b=bands(bgm,e.time),s=bands(se,e.time),delta=s.map((v,i)=>v-b[i]);
  // M2 Lv is now a short physical first strike, strongest in the 2–6kHz band.
  const primary=2;
  return {id:e.id,time:e.time,bands:['120–500','500–2000','2000–6000'],bgm:b,se:s,delta: b[primary]<-200 ? null : delta,primaryBand:primary,primaryDelta:b[primary]<-200?null:delta[primary],note:b[primary]<-200?'SE alone, BGM intentionally absent':'Primary-band difference; other bands are retained for diagnosis',method:'200ms (±100ms), stereo Hann FFT, Parseval normalized'};
});
function correlation(reference,actual,placeAt) {
  const start=Math.round(placeAt*48000),count=Math.min(reference.length/2,14400);
  function value(lag){let dot=0,a2=0,b2=0;for(let i=0;i<count;i+=4){const a=(reference[2*i]+reference[2*i+1])/2,b=(actual[(start+i+lag)*2]+actual[(start+i+lag)*2+1])/2;dot+=a*b;a2+=a*a;b2+=b*b;}return dot/Math.sqrt(a2*b2);}
  let best=-1,lag=0;
  for(let l=-3200;l<=3200;l+=4){const v=value(l);if(v>best){best=v;lag=l;}}
  for(let l=lag-4;l<=lag+4;l++){const v=value(l);if(v>best){best=v;lag=l;}}
  return {lagSamples:lag,lagSeconds:lag/48000,correlation:best};
}
const sync=proof.effects.map(e=>{
  const filter='highpass=f=2000';
  const r=correlation(decode(join(audio,'processed',`${e.key}.wav`),filter),decode(decoded,filter),e.placeAt);
  check(Math.abs(r.lagSeconds)<=1/30&&r.correlation>.4,`Final AAC sync ${e.id}`);
  return {...e,...r,audibleImpact:e.time+r.lagSeconds,errorFrames:r.lagSeconds*30};
});
const channelDc=[0,0],mono=new Float32Array(pcm.length/2);
for(let i=0;i<mono.length;i++){channelDc[0]+=pcm[i*2]/mono.length;channelDc[1]+=pcm[i*2+1]/mono.length;mono[i]=(pcm[i*2]+pcm[i*2+1])/2;}
check(channelDc.every(d=>Math.abs(d)<.002),'Per-channel DC');
const sampleStats={final:stats(pcm),decodedSeconds:pcm.length/96000,channelDc,mono:stats(mono),monoVsStereoRmsDb:stats(mono).rmsDbfs-stats(pcm).rmsDbfs,bgm:stats(bgm),se:stats(se),float:proof.floatStats,
  openingBlack:stats(pcm,48000*2,2*48000*2),tail:stats(pcm,Math.round(49.48*96000),Math.round(49.5*96000))};
const ranges={explore:[10,11],rest:[15.5,16.5],bossWaitActive:[31.5,32.5],bossActive:[35,36],reportRead:[28,29]};
const sceneRms=Object.fromEntries(Object.entries(ranges).map(([k,[s,e]])=>[k,stats(bgm,s*96000,e*96000).rmsDbfs]));
const boundaries=[...new Set([...proof.groups.map(g=>g.start),...proof.bars.map(b=>b.start),...proof.biomeChanges.map(b=>b.at),17.5,27.5,49.5])].sort((a,b)=>a-b);
const discontinuities=boundaries.map(t=>{
  const i=Math.min(pcm.length/2-1,Math.round(t*48000));let delta=0,near=0;
  for(let c=0;c<2;c++){delta=Math.max(delta,Math.abs(pcm[i*2+c]-pcm[(i-1)*2+c]));for(let j=Math.max(1,i-2400);j<Math.min(pcm.length/2,i+2400);j++)near=Math.max(near,Math.abs(pcm[j*2+c]-pcm[(j-1)*2+c]));}
  return {at:t,delta,nearby50msMaxDelta:near,relative:delta/(near||1)};
});
const plots=[];
function wave(path,name,start=0,duration=cues.duration){
  const image=join(qa,`${name}-wave.png`);ffmpeg(['-i',path,'-filter_complex',`atrim=start=${start}:duration=${duration},asetpts=PTS-STARTPTS,showwavespic=s=1800x400:split_channels=1`,'-frames:v','1',image]);
  plots.push({name:`${name}-wave`,file:image,start,duration,kind:'wave'});
}
function spectrum(path,name,start=0,duration=cues.duration){
  const image=join(qa,`${name}-spectrum.png`);ffmpeg(['-i',path,'-lavfi',`atrim=start=${start}:duration=${duration},asetpts=PTS-STARTPTS,showspectrumpic=s=1800x900:legend=1:scale=log:fscale=log:gain=1`,'-frames:v','1',image]);
  plots.push({name:`${name}-spectrum`,file:image,start,duration,kind:'spectrum'});
}
wave(decoded,'full');spectrum(decoded,'full');
for(const [key,path] of [['bgm',join(audio,'bgm.wav')],['se',join(audio,'se.wav')]]){wave(path,key);spectrum(path,key);}
for(const t of boundaries.filter(t=>t>0&&t<cues.duration))wave(decoded,`join-${t}`,Math.max(0,t-.5),1);
for(const e of proof.effects)wave(decoded,`impact-${e.id}`,e.time-.15,.30);
for(const t of [15.5,25.5,34.5,43.6]) {
  for(const [key,path] of [['final',decoded],['bgm',join(audio,'bgm.wav')],['se',join(audio,'se.wav')]])spectrum(path,`${key}-focus-${t}`,t-.5,1);
}
wave(decoded,'ending',48.5,1);
for(const key of Object.keys(proof.processing)) {
  const path=join(audio,'processed',`${key}.wav`),duration=proof.processing[key].processedDuration;
  wave(path,`processed-${key}`,0,duration);spectrum(path,`processed-${key}`,0,duration);
}
json(join(qa,'qa-proof.json'),{variants,scoreChecks:scoreChecks.length,semitones,tritones,bandRms,sync,sampleStats,sceneRms,discontinuities,plots,joins,loops,humanListening:false});
console.log(JSON.stringify({variants:variants.map(({variant,lufs,truePeak,pcmHash})=>({variant,lufs,truePeak,pcmHash})),bandRms:bandRms.map(({id,primaryDelta})=>({id,primaryDelta})),sceneRms,sync:sync.map(({id,errorFrames,correlation})=>({id,errorFrames,correlation})),images:plots.length},null,2));
