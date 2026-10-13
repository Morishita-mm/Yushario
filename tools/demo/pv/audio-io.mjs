import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
export const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
export const json = (path,data) => writeFileSync(path,JSON.stringify(data,null,2)+'\n');
export function ffmpeg(args) {
  const r=spawnSync('ffmpeg',['-hide_banner','-nostdin','-y',...args],{encoding:'utf8',maxBuffer:32*1024*1024});
  if (r.status!==0) throw Error(r.stderr||r.error?.message); return r.stderr;
}
export function decode(path,filters='anull') {
  const r=spawnSync('ffmpeg',['-v','error','-nostdin','-i',path,'-vn','-af',filters,'-ar','48000','-ac','2','-f','f32le','pipe:1'],{maxBuffer:64*1024*1024});
  if (r.status!==0) throw Error(r.stderr.toString());
  return new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset,r.stdout.byteOffset+r.stdout.byteLength));
}
export function stats(a,begin=0,end=a.length) {
  let peak=0,sum=0,sq=0,nonfinite=0,fullscale=0;
  for (let i=begin;i<end;i++) { const v=a[i]; if (!Number.isFinite(v)) nonfinite++; if (Math.abs(v)>=1) fullscale++; peak=Math.max(peak,Math.abs(v));sum+=v;sq+=v*v; }
  return {peak,peakDbfs:20*Math.log10(peak||1e-15),rmsDbfs:10*Math.log10(sq/(end-begin)||1e-30),dc:sum/(end-begin),nonfinite,fullscale};
}
export function wav(path,a) {
  const s=stats(a); if (s.nonfinite||s.fullscale||Math.abs(s.dc)>=.002) throw Error(`Unsafe float ${path}: ${JSON.stringify(s)}`);
  // IEEE float stereo WAV; preserve float precision until the single mastering pass.
  const b=Buffer.alloc(44+a.length*4);
  b.write('RIFF');b.writeUInt32LE(36+a.length*4,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);
  b.writeUInt16LE(3,20);b.writeUInt16LE(2,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(384000,28);
  b.writeUInt16LE(8,32);b.writeUInt16LE(32,34);b.write('data',36);b.writeUInt32LE(a.length*4,40);
  for(let i=0;i<a.length;i++)b.writeFloatLE(a[i],44+i*4);writeFileSync(path,b);return s;
}
export function loudness(path) {
  const log=ffmpeg(['-i',path,'-vn','-af','loudnorm=I=-15.8:TP=-2:LRA=20:print_format=json','-f','null','-']);
  return JSON.parse(log.match(/\{\s*"input_i"[\s\S]*?\}/)[0]);
}
