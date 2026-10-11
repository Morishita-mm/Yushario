// Equal-integrated-loudness v4/A/B comparison; all measurements stay local.
import { readFileSync,mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { decode,json,sha,loudness,wav } from './pv4-audio-io.mjs';
import { range,scale,lowTrace,powerWindows,density,windows,db } from './pv5-analysis.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),base=join(root,'.art-work/s89'),old=join(root,'.art-work/s88'),out=join(base,'qa');
mkdirSync(out,{recursive:true});
const read=p=>JSON.parse(readFileSync(p)),target=-15.85;
const inputs={v4:{audio:join(old,'audio'),final:join(old,'pv4a-ja-16x9.mp4')},
  A:{audio:join(base,'audio/a'),final:join(base,'pv5a-ja-16x9.mp4')},B:{audio:join(base,'audio/b'),final:join(base,'pv5b-ja-16x9.mp4')}};
const data={};
for(const [variant,input] of Object.entries(inputs)) {
  const proof=read(join(input.audio,'audio-proof.json')),measure=loudness(input.final),gain=target-(+measure.input_i);
  const before=decode(join(input.audio,'mix-float.wav')),master=decode(join(input.audio,'master.wav'));
  let dot=0,energy=0;for(let i=0;i<before.length;i++){dot+=before[i]*master[i];energy+=before[i]**2;}
  const observedGainDb=20*Math.log10(dot/energy);
  const actualAAC=decode(input.final),bgm=scale(decode(join(input.audio,'bgm.wav')),observedGainDb+gain),aac=scale(actualAAC,gain);
  const low=lowTrace(bgm),rms=powerWindows(bgm),aacRms=powerWindows(aac);
  const max=rows=>rows.reduce((a,b)=>a.rmsDbfs>b.rmsDbfs?a:b);
  data[variant]={input,proof,measure,gain,observedGainDb,bgm,aac,actualAAC,low,rms,aacRms,peakBgm:max(rms),peakAAC:max(aacRms)};
  wav(join(out,`${variant.toLowerCase()}-bgm-matched.wav`),bgm);
  json(join(out,`${variant.toLowerCase()}-low-100ms-25ms.json`),low);
  json(join(out,`${variant.toLowerCase()}-rms-400ms-10ms.json`),{bgm:rms,aac:aacRms});
}
const median=a=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)];
const threshold=median(data.v4.low.filter(r=>r.centre>=2&&r.centre<14).map(r=>r.lowDbfs))-6;
const aggregate=(rows,start,end)=> {
  const a=rows.filter(r=>r.centre>=start&&r.centre<end),low=a.reduce((s,r)=>s+10**(r.lowDbfs/10),0)/a.length;
  const total=a.reduce((s,r)=>s+10**(r.totalDbfs/10),0)/a.length;
  return {lowRmsDbfs:db(low),totalRmsDbfs:db(total),lowFraction:low/total,activeFraction:a.filter(r=>r.lowDbfs>=threshold).length/a.length,frames:a.length};
};
const measurements={};
for(const [variant,d] of Object.entries(data)) {
  const rows=windows.map(([name,start,end])=>({name,start,end,bgmRms:range(d.bgm,start,end).rmsDbfs,aacRms:range(d.aac,start,end).rmsDbfs,
    actualAAC:range(d.actualAAC,start,end).rmsDbfs,low:aggregate(d.low,start,end),density:density(d.proof.notes,start,end)}));
  const get=name=>rows.find(r=>r.name===name);
  const contrasts={bgmTitleVsDrive:get('title-peak').bgmRms-get('drive').bgmRms,aacTitleVsDrive:get('title-peak').aacRms-get('drive').aacRms,
    bgmRevealVsExplore:get('reveal').bgmRms-get('explore').bgmRms,aacRevealVsExplore:get('reveal').aacRms-get('explore').aacRms,
    bgmRestVsExplore:get('rest').bgmRms-get('explore').bgmRms,bgmWaitVsReveal:get('wait').bgmRms-get('reveal').bgmRms,
    lowRevealVsExplore:get('reveal').low.lowRmsDbfs-get('explore').low.lowRmsDbfs,
    lowDriveVsExplore:get('drive').low.lowRmsDbfs-get('explore').low.lowRmsDbfs,
    lowTitleVsExplore:get('title-peak').low.lowRmsDbfs-get('explore').low.lowRmsDbfs};
  const accents=[34.5,37.5,40.5].map(at=> {
    let peak=0,peakAt=at;for(let i=Math.round(at*48000);i<Math.round((at+.12)*48000);i++)for(let c=0;c<2;c++)
      if(Math.abs(d.bgm[i*2+c])>peak){peak=Math.abs(d.bgm[i*2+c]);peakAt=i/48000;}
    const notes=d.proof.notes.filter(n=>n.role==='stab'&&Math.abs(n.start-at)<1e-8);
    return {at,onsetFrameError:notes.length?0:null,notes:notes.length,first120msSamplePeakAt:peakAt,peakDelayFrames:(peakAt-at)*30};
  });
  const gates=variant==='v4'?null:{
    bgmTitleVsDrive:contrasts.bgmTitleVsDrive>=2&&contrasts.bgmTitleVsDrive<=3.5,
    aacTitleVsDrive:contrasts.aacTitleVsDrive>=2&&contrasts.aacTitleVsDrive<=3.5,
    bgmRevealVsExplore:contrasts.bgmRevealVsExplore>=1&&contrasts.bgmRevealVsExplore<=3,
    aacRevealVsExplore:contrasts.aacRevealVsExplore>=1&&contrasts.aacRevealVsExplore<=3,
    rest:contrasts.bgmRestVsExplore>=-7&&contrasts.bgmRestVsExplore<=-4,
    wait:contrasts.bgmWaitVsReveal>=-15&&contrasts.bgmWaitVsReveal<=-8,
    lowReveal:contrasts.lowRevealVsExplore>=1&&contrasts.lowRevealVsExplore<=3,
    lowTitle:contrasts.lowTitleVsExplore>=2&&contrasts.lowTitleVsExplore<=4,
    lowRevealOccupancy:get('reveal').low.activeFraction>get('explore').low.activeFraction,
    lowTitleOccupancy:get('title-peak').low.activeFraction>get('explore').low.activeFraction,
    titleIsBgmPeak:d.peakBgm.centre>=43.6&&d.peakBgm.centre<=45.1,
    cutAccentWithinFrame:accents.every(a=>a.notes>0&&a.peakDelayFrames<=1)};
  measurements[variant]={sourceHash:sha(d.input.final),actualIntegratedLufs:+d.measure.input_i,equalizedIntegratedTarget:target,
    comparisonGainDb:d.gain,observedMasterScalarGainDb:d.observedGainDb,rows,contrasts,gates,accents,peakBgm:d.peakBgm,peakAAC:d.peakAAC};
}
const improvement={};
for(const variant of ['A','B']) {
  const d=measurements[variant],v4=measurements.v4;
  improvement[variant]={titleVsDriveBgmIncreaseDb:d.contrasts.bgmTitleVsDrive-v4.contrasts.bgmTitleVsDrive,
    titleVsDriveAACIncreaseDb:d.contrasts.aacTitleVsDrive-v4.contrasts.aacTitleVsDrive,
    windows:d.rows.map((r,i)=>({name:r.name,bgmDeltaDb:r.bgmRms-v4.rows[i].bgmRms,aacDeltaDb:r.aacRms-v4.rows[i].aacRms,
      onsetRatio:r.density.allOnsets/(v4.rows[i].density.allOnsets||1),lowDeltaDb:r.low.lowRmsDbfs-v4.rows[i].low.lowRmsDbfs,
      occupancyDelta:r.low.activeFraction-v4.rows[i].low.activeFraction}))};
}
const A=measurements.A,B=measurements.B;
const comparison={targetLufs:target,commonLowActiveThresholdDbfs:threshold,thresholdReference:'v4 exploration 70–250Hz median minus 6dB, unchanged for A/B',
  lowMethod:'stereo Hann 100ms, 25ms hop, 8192-point FFT, Parseval power; means of powers, not mean dB; occupancy uses the same absolute threshold',
  rmsMethod:'stereo PCM RMS; AAC and BGM independently measured, whole-program equal-integrated gain only; source MP4s untouched',
  measurements,improvement,abIntegratedDifferenceLU:Math.abs(A.actualIntegratedLufs-B.actualIntegratedLufs),
  abFrontAACDifferenceDb:B.rows[0].aacRms-A.rows[0].aacRms,abFrontBgmDifferenceDb:B.rows[0].bgmRms-A.rows[0].bgmRms,
  humanListening:false};
json(join(out,'comparison.json'),comparison);
console.log(JSON.stringify(comparison,null,2));
