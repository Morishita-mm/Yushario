// Independently expand the adopted score for comparison with rendered notes.
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { score, arrangements, styles, arpPatterns, arpOmissions, percussion, drumVoices, stabs, duration } from './score.mjs';
import { json } from './audio-io.mjs';
const events=[], bars=[];
for (const [at,name,bar,style] of arrangements.B) {
  const s=score[name], c=styles[style], beat=60/s.bpm, beats=s.beats??s.barBeats?.[bar]??4;
  const end=at+beats*beat, stop=at+Math.min(beats,c.stopBeat??beats)*beat;
  if (at<2 || end>duration+1e-8 || (bars.length && at<bars.at(-1).end-1e-8)) throw Error('Score bounds/overlap');
  bars.push({at,end,name,bar,style,bpm:s.bpm,beats});
  for (const role of ['lead','bass','counter']) {
    const notes=s.beats?s[role]:s[role]?.[bar]; if (!notes) continue;
    let pos=0;
    for (const [pitch,length] of notes) {
      if (!Number.isInteger(pitch) || pitch<0 || pitch>127 || length<=0) throw Error('Invalid note');
      if (pitch && c[role] && pos<(c.stopBeat??beats)) {
        const start=at+pos*beat;
        events.push({start,end:start+Math.min(length*beat*c[role][1],stop-start),role,midi:pitch,name,bar,style});
      }
      pos+=length;
    }
    if (Math.abs(pos-beats)>1e-8) throw Error(`Beats ${name}/${role}`);
  }
  const chord=s.beats?s.arp:s.arp?.[bar];
  let pattern=arpPatterns[c.arpMode]??[];
  if (c.arpMode==='explicit') {
    let pos=0; pattern=s.arpNotes.map(([pitch,b])=>{const row=[pos,pitch,b];pos+=b;return row;});
    if (Math.abs(pos-beats)>1e-8) throw Error('Arpeggio beats');
  }
  for (const [pos,index,length] of pattern) {
    const pitch=c.arpMode==='explicit'?index:chord?.[index], start=at+pos*beat;
    if (!pitch || pos>=(c.stopBeat??beats) || arpOmissions.some(o=>Math.abs(o.at-start)<1e-8&&o.midi===pitch)) continue;
    events.push({start,end:start+Math.min(length*beat*c.arp[1],stop-start),role:'arp',midi:pitch,name,bar,style});
  }
  for (const [pos,role] of percussion[c.drums]) {
    if (pos>=(c.stopBeat??beats)) continue;
    const start=at+pos*beat;
    events.push({start,end:start+drumVoices[role][1],role,midi:0,name,bar,style});
  }
}
for (const [start,chord,length] of stabs.B) for (const midi of chord) events.push({start,end:start+length,role:'stab',midi});
events.sort((a,b)=>a.start-b.start);
if (Math.abs(bars.at(-1).end-duration)>1e-8 || events.some(n=>n.end>49.45+1e-8)) throw Error('Score ending');
const base=resolve('.art-work/pv'); mkdirSync(base,{recursive:true});
json(join(base,'planned-notes.json'),{B:events});
console.log(`B: ${bars.length} bars, ${events.length} planned notes.`);
