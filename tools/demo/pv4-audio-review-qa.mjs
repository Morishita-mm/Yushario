// S8.8-M2 regression diagnostics: independent direct decoding, pitch, texture and gaps.
// Reads completed files; writes only ignored audio/qa/m2. No network or listening claim.
import { readFileSync,mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { json,ffmpeg,stats,wav } from './pv4-audio-io.mjs';
const base=fileURLToPath(new URL('../../.art-work/s88/',import.meta.url)),audio=join(base,'audio'),out=join(audio,'qa/m2');
mkdirSync(out,{recursive:true});
function raw(path,filter='anull') {
  const b=execFileSync('ffmpeg',['-v','error','-nostdin','-i',path,'-vn','-af',filter,'-ar','48000','-ac','2','-f','f32le','pipe:1'],{maxBuffer:64*1024*1024});
  return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
}
const hash=a=>createHash('sha256').update(Buffer.from(a.buffer)).digest('hex');
const range=(a,s,e)=>stats(a,Math.round(s*96000),Math.min(a.length,Math.round(e*96000)));
function spectrum(a,start=0,end=a.length/96000) {
  const count=Math.round((end-start)*48000),N=Math.max(32768,2**Math.ceil(Math.log2(count)));
  const re=new Float64Array(N),im=new Float64Array(N);
  for(let i=0;i<count;i++) { const j=(Math.round(start*48000)+i)*2;re[i]=(a[j]+a[j+1])/2*(.5-.5*Math.cos(2*Math.PI*i/(count-1))); }
  for(let i=1,j=0;i<N;i++){let bit=N>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)[re[i],re[j]]=[re[j],re[i]];}
  for(let len=2;len<=N;len*=2)for(let at=0;at<N;at+=len)for(let j=0;j<len/2;j++) {
    const angle=-2*Math.PI*j/len,c=Math.cos(angle),s=Math.sin(angle),k=at+j,l=k+len/2;
    const r=re[l]*c-im[l]*s,m=re[l]*s+im[l]*c;re[l]=re[k]-r;im[l]=im[k]-m;re[k]+=r;im[k]+=m;
  }
  const binHz=48000/N,power=Float64Array.from(re.subarray(0,N/2),(_,i)=>re[i]**2+im[i]**2);
  const total=power.reduce((s,p)=>s+p,0);
  const energy=(lo,hi)=>power.reduce((s,p,i)=>s+(i*binHz>=lo&&i*binHz<hi?p:0),0)/total;
  function peak(lo,hi) {
    let k=Math.ceil(lo/binHz);for(let i=k;i<Math.min(power.length-1,Math.floor(hi/binHz));i++)if(power[i]>power[k])k=i;
    const l=Math.log(power[k-1]||1e-300),c=Math.log(power[k]||1e-300),r=Math.log(power[k+1]||1e-300);
    const interpolated=(k+.5*(l-r)/(l-2*c+r))*binHz;
    return {binHz:k*binHz,interpolatedHz:interpolated,centsFromA6:1200*Math.log2(interpolated/1760)};
  }
  return {start,end,fftBinHz:binHz,windowSeconds:end-start,zeroPadding:N>count,
    dominant:peak(120,24000),ring:peak(1500,2200),energyFraction:{low:energy(120,500),mid:energy(500,2000),high:energy(2000,6000),above6000:energy(6000,24000)},
    centroidHz:power.reduce((s,p,i)=>s+p*i*binHz,0)/total};
}
function silence(a,start=0,end=49.5) {
  const spans=[];let since=null;
  for(let s=start;s<end;s=+(s+.01).toFixed(2)) {
    const quiet=range(a,s,Math.min(s+.01,end)).rmsDbfs < -70;
    if(quiet&&since===null)since=s;
    if(!quiet&&since!==null){if(s-since>=.09999)spans.push({start:since,end:s,duration:s-since});since=null;}
  }
  if(since!==null&&end-since>=.09999)spans.push({start:since,end,duration:end-since});return spans;
}
const proof=JSON.parse(readFileSync(join(audio,'audio-proof.json'))),oldProof=JSON.parse(readFileSync(join(out,'before/audio-proof.json')));
const final=raw(join(base,'pv4a-ja-16x9.mp4')),before=raw(join(out,'before/final-decoded.wav'));
const beforePcmHash=hash(before),oldQa=JSON.parse(readFileSync(join(out,'before/qa-proof.json')));
if(beforePcmHash!==oldQa.variants[0].pcmHash)throw Error('Before-PCM provenance mismatch');
const level=raw(join(audio,'processed/level.wav')),oldLevel=raw(join(out,'before/level.wav')),source=raw(join(audio,'sources/level.mp3'));
// R1-only intermediate verifies the rate fix independently before R3 shortening.
const correctedRing=raw(join(audio,'sources/level.mp3'),'atrim=start=0.004,asetpts=PTS-STARTPTS,aresample=48000,bandpass=f=1993:t=h:w=120,bandpass=f=1993:t=h:w=120,asetrate=42763.1385,aresample=48000,atrim=duration=0.4,afade=t=in:d=0.003,afade=t=out:st=0.365:d=0.035');
const ringGain=10**(-26/20)/stats(correctedRing).peak;
for(let i=0;i<correctedRing.length;i++)correctedRing[i]*=ringGain;
wav(join(out,'correctedRing.wav'),correctedRing);
const ranges=[[12.5,14],[14,14.5],[14.5,15],[14,15.5],[15,15.5],[15.5,16.5],[21.5,22],[22,22.4],[42.5,43.2],[43.2,43.6],[43.6,44.6],[49,49.5]];
const windows=ranges.map(([s,e])=>({start:s,end:e,before:range(before,s,e),after:range(final,s,e)}));
const afterDrop=range(final,14,15.5).rmsDbfs-range(final,12.5,14).rmsDbfs;
const sourceRate=+JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=sample_rate','-of','json',join(audio,'sources/level.mp3')])).streams[0].sample_rate;
const spectra={beforeLevel:spectrum(oldLevel),correctedRing:spectrum(correctedRing),sourceFirstStrike:spectrum(source,.004,.045),afterLevel:spectrum(level)};
const pitch=spectra.afterLevel.ring;
if(Math.abs(pitch.centsFromA6)>20)throw Error(`Level fundamental not A6 ±20 cents: ${JSON.stringify(pitch)}`);
if(spectra.afterLevel.energyFraction.high<.2 || spectra.afterLevel.energyFraction.mid>.95 || level.length/96000>.06)
  throw Error('R3 physical-strike texture/duration regressed');
if(afterDrop < -4 || afterDrop > -2)throw Error(`Walking exit RMS delta outside 2–4dB aim: ${afterDrop}`);
const quietBefore=silence(before,14,15.5),quietAfter=silence(final,14,15.5);
if(quietAfter.some(s=>s.duration>=.2))throw Error('Walking exit still has long unmotivated silence');
const exit=proof.bars.find(b=>b.phrase==='exploreExit');
if(!exit||exit.beats!==3||exit.start!==14||exit.end!==15.5||proof.notes.filter(n=>n.group==='exploreExit').some(n=>n.end>15.5))throw Error('Exit score/cue range');
const bgm=raw(join(audio,'bgm.wav')),oldBgm=raw(join(out,'before/bgm.wav'));
const bossUnchanged=hash(bgm.slice(34.5*96000,43.6*96000))===hash(oldBgm.slice(34.5*96000,43.6*96000));
if(!bossUnchanged)throw Error('Boss body/bridge changed unintentionally');
const decodedVariants=proof.outputs;
const variantHashes=Object.keys(decodedVariants).map(v=>({variant:v,pcmHash:hash(raw(join(base,`pv4a-${v}.mp4`)))}));
if(new Set(variantHashes.map(v=>v.pcmHash)).size!==1)throw Error('Independent four-version PCM mismatch');
const traces=[];
for(let t=12.5;t<16.5;t=+(t+.01).toFixed(2))traces.push({time:t,before:range(before,t,t+.01).rmsDbfs,after:range(final,t,t+.01).rmsDbfs});
json(join(out,'rms-10ms.json'),traces);
// A6 band in the completed AAC, independent of the source-material FFT.
const e=proof.effects.find(e=>e.key==='level'),finalLevelBand=raw(join(base,'pv4a-ja-16x9.mp4'),'bandpass=f=1775:t=h:w=250');
const finalPitch=spectrum(finalLevelBand,e.placeAt,e.placeAt+e.duration);
if(Math.abs(finalPitch.ring.centsFromA6)>20)throw Error('Completed AAC level pitch');
const evidence={beforePcmHash,pitchTarget:'A6 fundamental within ±20 cents; strongest inharmonic metal partial is recorded separately, not labelled A6',sourceRate,processingRate:48000,asetrate:42763.1385,semitoneShift:12*Math.log2(42763.1385/48000),spectra,finalPitch,
  windows,walkingExitDeltaDb:afterDrop,quietBefore,quietAfter,fullSilences:silence(final),exit,bossUnchanged,variantHashes,
  anchors:{before:oldProof.effects.find(e=>e.key==='level'),after:e},
  spectralMethod:'Independent ffmpeg 48kHz decode; mono Hann FFT, >=32768 zero-padded bins with quadratic log-power peak interpolation; padding is not extra time resolution.',humanListening:false};
json(join(out,'independent-analysis.json'),evidence);
for(const [name,path,start,duration] of [['before',join(out,'before/final-decoded.wav'),12.5,4],['after',join(base,'pv4a-ja-16x9.mp4'),12.5,4]]) {
  ffmpeg(['-i',path,'-vn','-filter_complex',`atrim=start=${start}:duration=${duration},asetpts=PTS-STARTPTS,showwavespic=s=1800x400:split_channels=1`,'-frames:v','1',join(out,`${name}-walk-wave.png`)]);
  ffmpeg(['-i',path,'-vn','-lavfi',`atrim=start=${start}:duration=${duration},asetpts=PTS-STARTPTS,showspectrumpic=s=1800x900:legend=1:scale=log:fscale=log:gain=1`,'-frames:v','1',join(out,`${name}-walk-spectrum.png`)]);
}
for(const [name,path] of [['before',join(out,'before/level.wav')],['after',join(audio,'processed/level.wav')]])
  ffmpeg(['-i',path,'-lavfi','showspectrumpic=s=1800x900:legend=1:scale=log:fscale=lin:start=1500:stop=2200','-frames:v','1',join(out,`${name}-level-pitch.png`)]);
console.log(JSON.stringify({pitch,finalPitch:finalPitch.ring,texture:spectra.afterLevel.energyFraction,windows:windows.map(w=>({start:w.start,end:w.end,before:w.before.rmsDbfs,after:w.after.rmsDbfs})),afterDrop,quietBefore,quietAfter,bossUnchanged,variantHashes},null,2));
