// Local signal diagnostics. No app code, audio playback or dependencies.
import { stats } from './audio-io.mjs';
export const range=(a,s,e)=>stats(a,Math.round(s*96000),Math.min(a.length,Math.round(e*96000)));
export const db=power=>10*Math.log10(power||1e-30);
export function scale(a,gainDb) { const g=10**(gainDb/20);return Float32Array.from(a,v=>v*g); }
const tables=new Map();
function fft(re,im) {
  const N=re.length;let table=tables.get(N);
  if(!table) {
    const reverse=new Uint32Array(N),cos=new Float64Array(N/2),sin=new Float64Array(N/2);
    for(let i=1,j=0;i<N;i++){let bit=N>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;reverse[i]=j;}
    for(let i=0;i<N/2;i++){cos[i]=Math.cos(-2*Math.PI*i/N);sin[i]=Math.sin(-2*Math.PI*i/N);}
    table={reverse,cos,sin};tables.set(N,table);
  }
  const {reverse,cos,sin}=table;
  for(let i=1;i<N;i++){const j=reverse[i];if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
  for(let len=2;len<=N;len*=2)for(let at=0;at<N;at+=len)for(let j=0;j<len/2;j++) {
    const k=at+j,l=k+len/2,c=cos[j*N/len],s=sin[j*N/len];
    const r=re[l]*c-im[l]*s,m=re[l]*s+im[l]*c;
    re[l]=re[k]-r;im[l]=im[k]-m;re[k]+=r;im[k]+=m;
  }
}
export function spectrum(a,start,length,padding=0) {
  const count=Math.round(length*48000),N=Math.max(padding,2**Math.ceil(Math.log2(count)));
  const power=new Float64Array(N/2+1);let weight=0;
  for(let ch=0;ch<2;ch++) {
    const re=new Float64Array(N),im=new Float64Array(N);weight=0;
    for(let i=0;i<count;i++) {
      const w=.5-.5*Math.cos(2*Math.PI*i/(count-1));weight+=w*w;
      re[i]=(a[(Math.round(start*48000)+i)*2+ch]??0)*w;
    }
    fft(re,im);
    for(let k=0;k<=N/2;k++)power[k]+=(k===0||k===N/2?1:2)*(re[k]**2+im[k]**2)/(N*weight*2);
  }
  return {power,binHz:48000/N,count,N};
}
export function bandPower(s,lo,hi) {
  let energy=0;for(let k=Math.ceil(lo/s.binHz);k<Math.min(s.power.length,Math.ceil(hi/s.binHz));k++)energy+=s.power[k];
  return energy;
}
export function peakFrequency(s,lo,hi) {
  let k=Math.max(1,Math.ceil(lo/s.binHz));
  for(let i=k;i<Math.min(s.power.length-1,Math.floor(hi/s.binHz));i++)if(s.power[i]>s.power[k])k=i;
  const l=Math.log(s.power[k-1]||1e-300),c=Math.log(s.power[k]||1e-300),r=Math.log(s.power[k+1]||1e-300);
  return (k+.5*(l-r)/(l-2*c+r))*s.binHz;
}
export function lowTrace(a) {
  const rows=[];
  for(let i=0;i<=1976;i++) {
    const start=i*.025,s=spectrum(a,start,.1),total=s.power.reduce((a,b)=>a+b,0),low=bandPower(s,70,250);
    rows.push({start,centre:start+.05,end:start+.1,lowDbfs:db(low),totalDbfs:db(total),lowFraction:low/(total||1)});
  }
  return rows;
}
export function powerWindows(a,width=.4,hop=.01,start=2,end=49.5) {
  const prefix=new Float64Array(a.length/2+1);
  for(let i=0;i<a.length/2;i++)prefix[i+1]=prefix[i]+(a[i*2]**2+a[i*2+1]**2)/2;
  const rows=[];
  for(let t=start;t+width<=end+1e-8;t=+(t+hop).toFixed(5)) {
    const i=Math.round(t*48000),j=Math.round((t+width)*48000);
    rows.push({start:t,end:t+width,centre:t+width/2,rmsDbfs:db((prefix[j]-prefix[i])/(j-i))});
  }
  return rows;
}
export function silence(a,start,end,threshold=-70) {
  const spans=[];let since=null;
  for(let t=start;t<end-1e-8;t=+(t+.01).toFixed(5)) {
    const quiet=range(a,t,Math.min(t+.01,end)).rmsDbfs<threshold;
    if(quiet&&since===null)since=t;
    if(!quiet&&since!==null){spans.push({start:since,end:t,seconds:t-since});since=null;}
  }
  if(since!==null)spans.push({start:since,end,seconds:end-since});return spans;
}
export function correlation(reference,actual,placeAt) {
  const start=Math.round(placeAt*48000),count=Math.min(reference.length/2,14400);
  function value(lag) {
    let dot=0,a2=0,b2=0;
    for(let i=0;i<count;i+=4) {
      const a=(reference[i*2]+reference[i*2+1])/2,b=(actual[(start+i+lag)*2]+actual[(start+i+lag)*2+1])/2;
      dot+=a*b;a2+=a*a;b2+=b*b;
    }
    return dot/Math.sqrt(a2*b2);
  }
  let best=-1,lag=0;
  for(let l=-3200;l<=3200;l+=4){const v=value(l);if(v>best){best=v;lag=l;}}
  const centre=lag;
  for(let l=centre-4;l<=centre+4;l++){const v=value(l);if(v>best){best=v;lag=l;}}
  return {lagSamples:lag,errorFrames:lag/48000*30,correlation:best};
}
export function density(notes,start,end) {
  const events=notes.filter(n=>n.start>=start&&n.start<end),seconds=end-start;
  const roles=Object.fromEntries(['lead','bass','arp','counter','kick','snare','hat','tom','noise','stab'].map(role=>[role,events.filter(n=>n.role===role).length]));
  const edge=notes.filter(n=>n.end>start&&n.start<end).flatMap(n=>[[Math.max(n.start,start),1],[Math.min(n.end,end),-1]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  let active=0,max=0,integral=0,last=start;
  for(const [time,change] of edge){integral+=(time-last)*active;last=time;active+=change;max=Math.max(max,active);}
  return {allOnsets:events.length,onsetsPerSecond:events.length/seconds,roles,bassOnsetsPerSecond:roles.bass/seconds,maxSimultaneousVoices:max,meanSimultaneousVoices:integral/seconds};
}
export const windows=[['explore',2,14],['walk-exit',14,15.5],['rest',15.5,19.5],['wait',31.5,34.5],
  ['reveal',34.5,37.5],['drive',37.5,40.5],['climax',40.5,43.3],['title-peak',43.6,45.1]];
