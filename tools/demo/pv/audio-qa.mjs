// Completed AAC + independently expanded score checks. Not a listening approval.
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { decode,stats,json,sha,loudness,ffmpeg } from './audio-io.mjs';
import { range,spectrum,bandPower,peakFrequency,db,correlation,silence,density,windows,powerWindows } from './analysis.mjs';
import { score,cueHash } from './score.mjs';
const variant='B',base=resolve('.art-work/pv');
const audio=join(base,'audio'),qa=join(base,'qa/audio');mkdirSync(qa,{recursive:true});
const proof=JSON.parse(readFileSync(join(audio,'audio-proof.json'))),cues=JSON.parse(readFileSync(join(base,'video/cues.json')));
const check=(ok,msg)=>{if(!ok)throw Error(msg);};
check(sha(join(base,'video/cues.json'))===cueHash&&sha(new URL('./score.mjs',import.meta.url))===proof.scoreSha256,'Cue/score changed');
const planned=JSON.parse(readFileSync(join(base,'planned-notes.json')))[variant];
check(planned.length===proof.notes.length,'Planned vs rendered onset count');
const key=n=>`${n.role}:${n.midi}:${n.start.toFixed(8)}:${n.end.toFixed(8)}`;
check(JSON.stringify(planned.map(key).sort())===JSON.stringify(proof.notes.map(key).sort()),'Rendered note times differ from score');
const scoreChecks=[];
for(const b of proof.bars) {
  const s=score[b.phrase],allowed=b.phrase==='pickup'?[3,6,11]:b.phrase.startsWith('bossA')&&b.bar===5?[1,2,3,4,6,7,9,11]:
    /[AB]$/.test(b.phrase)?b.phrase.endsWith('A')?[1,2,4,6,7,9,11]:[1,3,4,6,8,9,11]:[0,2,4,5,7,9,11];
  for(const role of ['lead','bass','counter']) {
    const line=s.beats?s[role]:s[role]?.[b.bar];if(!line)continue;
    const beats=line.reduce((t,n)=>t+n[1],0);
    check(Math.abs(beats-b.beats)<1e-8&&line.every(([p])=>!p||allowed.includes(p%12)),`Score pitch/beats ${b.phrase}/${role}`);
    scoreChecks.push({phrase:b.phrase,bar:b.bar,role,beats,pitches:line.map(n=>n[0]).filter(Boolean)});
  }
}
for(const n of proof.notes)check(n.start>=2&&n.end<=49.45+1e-8&&n.end-n.start>=n.attack+n.release-1e-8,`Voice range ${key(n)}`);
const tonal=proof.notes.filter(n=>n.midi>0),semitones=[];
for(let i=0;i<tonal.length;i++)for(let j=i+1;j<tonal.length;j++) {
  const a=tonal[i],b=tonal[j];if(b.start>=a.end)break;
  const overlap=Math.min(a.end,b.end)-b.start;
  if(Math.abs(a.midi-b.midi)===1)semitones.push({start:b.start,seconds:overlap,a:{role:a.role,midi:a.midi},b:{role:b.role,midi:b.midi}});
}
check(!semitones.some(s=>s.seconds>.150001),'Sustained adjacent semitone');
const variants=[],pcmHash=a=>createHash('sha256').update(Buffer.from(a.buffer)).digest('hex');
const packetHash=p=>execFileSync('ffmpeg',['-v','error','-i',p,'-map','0:v:0','-c','copy','-f','hash','-hash','sha256','-'],{encoding:'utf8'}).trim();
for(const version of cues.variants) {
  const file=join(base,'final',`pv-${version}.mp4`),source=join(base,'video',`source-${version}.mp4`);
  const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file]));
  const video=info.streams.find(s=>s.codec_type==='video'),aud=info.streams.filter(s=>s.codec_type==='audio');
  check(aud.length===1&&aud[0].codec_name==='aac'&&aud[0].sample_rate==='48000'&&aud[0].channels===2,`Audio stream ${version}`);
  check(video.codec_name==='h264'&&+video.nb_frames===1485&&video.r_frame_rate==='30/1'&&+video.duration===49.5&&+aud[0].duration===49.5,`Duration/rate ${version}`);
  check(video.start_time==='0.000000'&&aud[0].start_time==='0.000000',`Start PTS ${version}`);
  check(packetHash(file)===packetHash(source),`Video changed ${version}`);
  const pcm=decode(file),measure=loudness(file),s=stats(pcm);
  check(+measure.input_i>=-16&&+measure.input_i<=-14&&+measure.input_tp<=-1.5,`Loudness ${version}`);
  check(!s.nonfinite&&!s.fullscale&&Math.abs(s.dc)<.002,`PCM safety ${version}`);
  variants.push({version,file,sha256:sha(file),videoPacketHash:packetHash(file),pcmHash:pcmHash(pcm),width:video.width,height:video.height,
    frames:+video.nb_frames,audioStart:aud[0].start_time,videoStart:video.start_time,duration:49.5,lufs:+measure.input_i,truePeak:+measure.input_tp,stats:s});
}
check(new Set(variants.map(v=>v.pcmHash)).size===1,'Four versions differ in audio');
const final=join(base,'final/pv-ja-16x9.mp4'),pcm=decode(final),bgm=decode(join(audio,'bgm.wav')),se=decode(join(audio,'se.wav'));
const decoded=join(qa,'final-decoded.wav');
ffmpeg(['-i',final,'-vn','-ar','48000','-ac','2','-c:a','pcm_f32le',decoded]);
writeFileSync(join(qa,'ebur128.txt'),ffmpeg(['-i',decoded,'-af','ebur128=peak=true','-f','null','-']));
writeFileSync(join(qa,'astats.txt'),ffmpeg(['-i',decoded,'-af','astats=metadata=1:reset=0','-f','null','-']));
const high=decode(final,'highpass=f=2000');
const sync=proof.effects.map(e=> {
  check(e.time===e.frame/30&&e.placeAt>=0&&e.placeAt+e.duration<=49.5,'Effect bounds');
  const ref=decode(proof.processing[e.key].path,'highpass=f=2000'),result=correlation(ref,high,e.placeAt);
  check(Math.abs(result.errorFrames)<=1&&result.correlation>.4,`SE sync ${e.id}`);
  return {...e,...result};
});
const bandRms=proof.effects.map(e=> {
  const a=spectrum(bgm,e.time-.1,.2),b=spectrum(se,e.time-.1,.2);
  const bands=[[120,500],[500,2000],[2000,6000]].map(([lo,hi])=>({lo,hi,bgm:db(bandPower(a,lo,hi)),se:db(bandPower(b,lo,hi))}));
  return {id:e.id,time:e.time,bands,primaryDelta:bands[2].bgm<-200?null:bands[2].se-bands[2].bgm};
});
const pitchChecks=[],pitchSkipped=[];
for(const role of ['lead','counter','arp']) {
  const stem=decode(join(audio,`${role}-dry.wav`));
  for(const n of proof.notes.filter(n=>n.role===role)) {
    const morphAt=(role==='arp'&&['explore','exploreExit'].includes(n.phrase)?[11,12.5]:role==='lead'&&n.phrase==='rest'?[17.5]:[]).find(t=>n.start<t+.1&&n.end>t)??null;
    const start=morphAt!==null&&n.start<morphAt+.1&&n.end>morphAt?Math.max(n.start+.006,morphAt+.106):n.start+.006;
    const length=Math.min(.20,n.end-start-n.release-.002);
    if(length<.02){pitchSkipped.push({role,start:n.start,midi:n.midi,reason:'No 20ms steady window outside the deliberate 100ms morph'});continue;}
    const s=spectrum(stem,start,length,32768),measured=peakFrequency(s,n.frequency*.85,n.frequency*1.15),cents=1200*Math.log2(measured/n.frequency);
    check(Math.abs(cents)<=25,`Rendered pitch ${role}/${n.start}: ${cents} cents`);
    pitchChecks.push({role,start:n.start,midi:n.midi,expectedHz:n.frequency,measuredHz:measured,cents,seconds:length,zeroPadding:true});
  }
}
const level=proof.effects.find(e=>e.key==='level'),material=decode(proof.processing.level.path);
const levelSpectrum=spectrum(material,0,material.length/96000,32768),levelHz=peakFrequency(levelSpectrum,1500,2200);
const filteredLevel=decode(final,'bandpass=f=1775:t=h:w=250'),s=spectrum(filteredLevel,level.placeAt,level.duration,32768);
const finalLevelHz=peakFrequency(s,1500,2200);
check(Math.abs(1200*Math.log2(levelHz/1760))<20&&Math.abs(1200*Math.log2(finalLevelHz/1760))<20,'A6 level pitch');
const channels=[0,0],mono=new Float32Array(pcm.length/2);
for(let i=0;i<mono.length;i++){for(let c=0;c<2;c++)channels[c]+=pcm[i*2+c]/mono.length;mono[i]=(pcm[i*2]+pcm[i*2+1])/2;}
const monoDelta=stats(mono).rmsDbfs-stats(pcm).rmsDbfs;
check(channels.every(d=>Math.abs(d)<.002)&&monoDelta>-1,'DC/mono fold-down');
const boundaries=[...new Set([...proof.bars.map(b=>b.start),...cues.scenes.map(s=>s.start),34.35,43.3,43.6,49.5])].sort((a,b)=>a-b);
const discontinuities=boundaries.filter(t=>t>0).map(t=> {
  const i=Math.round(t*48000);let delta=0,near=0;
  for(let c=0;c<2;c++){delta=Math.max(delta,Math.abs(pcm[i*2+c]-pcm[(i-1)*2+c]));
    for(let j=Math.max(1,i-2400);j<Math.min(pcm.length/2,i+2400);j++)near=Math.max(near,Math.abs(pcm[j*2+c]-pcm[(j-1)*2+c]));}
  return {at:t,delta,nearby50msMax:near,relative:delta/(near||1)};
});
const joins=proof.bars.slice(1).map((b,i)=> {
  const prev=proof.bars[i],out=proof.notes.filter(n=>n.start>=prev.start&&n.start<prev.end),incoming=proof.notes.filter(n=>n.start===b.start);
  return {at:b.start,from:prev.phrase,to:b.phrase,outEnd:Math.max(...out.map(n=>n.end)),newMidis:incoming.map(n=>n.midi),bpm:b.bpm};
});
const pauses=[['walk-exit',14,15.5],['pre-reveal',34.35,34.5],['pre-title',43.3,43.6],['tail',49.48,49.5]].map(([name,start,end])=>({name,start,end,bgm:range(bgm,start,end),aac:range(pcm,start,end),silence:silence(pcm,start,end)}));
check(!pauses[0].silence.some(s=>s.seconds>=.2),'Old walking silence regressed');
check(pauses.slice(1).every(p=>p.bgm.peak<1e-6&&p.aac.rmsDbfs<-70),'Mandatory gaps/tail');
const onsetTrace=[];
for(let t=2;t+1.5<=49.5;t=+(t+.1).toFixed(3))onsetTrace.push({start:t,end:t+1.5,...density(proof.notes,t,t+1.5)});
json(join(qa,'onset-1.5s-100ms.json'),onsetTrace);
json(join(qa,'pitch-checks.json'),{pitchChecks,pitchSkipped,level:{materialHz:levelHz,materialCents:1200*Math.log2(levelHz/1760),aacHz:finalLevelHz,aacCents:1200*Math.log2(finalLevelHz/1760)},
  limitations:'Isolated rendered voice stems, Hann FFT + interpolated peak; zero-padding does not add time resolution. Short metal strike may have stronger inharmonic partials.'});
json(join(qa,'score-and-joins.json'),{plannedCount:planned.length,renderedCount:proof.notes.length,exactTimingMatch:true,scoreChecks,semitones,joins,discontinuities,pauses});
const result={variant,variants,bandRms,sync,channelDc:channels,monoDelta,pauses,discontinuities,pitchCount:pitchChecks.length,
  decodedSeconds:pcm.length/96000,rawBgmWindows:windows.map(([name,start,end])=>({name,start,end,rms:range(bgm,start,end).rmsDbfs})),
  peak400:powerWindows(pcm).reduce((a,b)=>a.rmsDbfs>b.rmsDbfs?a:b),humanListening:false};
json(join(qa,'qa-proof.json'),result);
console.log(JSON.stringify(result,null,2));
