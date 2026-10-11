// Offline plots from final files; images are diagnostic, not a listening claim.
import { readFileSync,mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { ffmpeg,json } from './pv4-audio-io.mjs';
import { density } from './pv5-analysis.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),base=join(root,'.art-work/s89'),qa=join(base,'qa');
const read=p=>JSON.parse(readFileSync(p)),plots=[],curves={bgm:{},aac:{},low:{},density:{}};
for(const variant of ['v4','A','B']) {
  const key=variant.toLowerCase(),rms=read(join(qa,`${key}-rms-400ms-10ms.json`)),low=read(join(qa,`${key}-low-100ms-25ms.json`));
  curves.bgm[variant]=rms.bgm.map(r=>({time:r.centre,value:r.rmsDbfs}));
  curves.aac[variant]=rms.aac.map(r=>({time:r.centre,value:r.rmsDbfs}));
  curves.low[variant]=low.map(r=>({time:r.centre,value:r.lowDbfs}));
  const audio=variant==='v4'?join(root,'.art-work/s88/audio'):join(base,'audio',key),proof=read(join(audio,'audio-proof.json'));
  curves.density[variant]=[];
  for(let t=2;t+1.5<=49.5;t=+(t+.1).toFixed(3))curves.density[variant].push({time:t+.75,value:density(proof.notes,t,t+1.5).onsetsPerSecond});
  if(variant==='v4')continue;
  const dir=join(qa,key,'plots');mkdirSync(dir,{recursive:true});
  const pcm=join(qa,key,'final-decoded.wav'),bgm=join(qa,`${key}-bgm-matched.wav`);
  function wave(path,name,start,length) {
    const file=join(dir,`${name}-wave.png`);
    ffmpeg(['-i',path,'-vn','-filter_complex',`atrim=start=${start}:duration=${length},asetpts=PTS-STARTPTS,showwavespic=s=1200x300:split_channels=1`,'-frames:v','1',file]);
    plots.push({variant,name,kind:'wave',start,end:start+length,file});
  }
  function spectrum(path,name,start,length) {
    const file=join(dir,`${name}-spectrum.png`);
    ffmpeg(['-i',path,'-vn','-lavfi',`atrim=start=${start}:duration=${length},asetpts=PTS-STARTPTS,showspectrumpic=s=1600x700:legend=1:scale=log:fscale=log:gain=1`,'-frames:v','1',file]);
    plots.push({variant,name,kind:'spectrum',start,end:start+length,file});
  }
  wave(pcm,'full-aac',0,49.5);spectrum(pcm,'full-aac',0,49.5);
  wave(bgm,'full-bgm',0,49.5);spectrum(bgm,'full-bgm',0,49.5);
  const joins=[...new Set([...proof.bars.map(b=>b.start),14,17.5,22,25.5,27.5,34.35,43.3,43.6,49])].sort((a,b)=>a-b);
  for(const t of joins)wave(pcm,`join-${t}`,Math.max(0,t-.5),1);
  for(const e of proof.effects)wave(pcm,`impact-${e.id}`,e.time-.15,.3);
  for(const t of [14,15.5,22,25.5,34.5,37.5,40.5,43.6]) {
    spectrum(pcm,`aac-focus-${t}`,t-.5,1);spectrum(bgm,`bgm-focus-${t}`,t-.5,1);
  }
  wave(pcm,'tail',48.5,1);
  for(const version of ['ja-16x9','en-16x9','ja-1x1','en-1x1'])
    ffmpeg(['-i',proof.outputs[version].path,'-vf','select=eq(n\\,1470)','-frames:v','1',join(dir,`ending-${version}.png`)]);
}
json(join(qa,'curves.json'),curves);json(join(qa,'plots.json'),plots);
console.log(JSON.stringify({plots:plots.length,variants:['A','B'],humanListening:false},null,2));
