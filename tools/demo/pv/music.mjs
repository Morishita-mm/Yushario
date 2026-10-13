// Final trailer score renderer, separate from the application.
import { score, arrangements, styles, arpPatterns, arpOmissions, percussion,
  drumVoices, stabs, accents, guards, duration } from './score.mjs';
import { buffer, rate, tone, hz, add, fade } from './synth.mjs';

export function renderMusic(variant, cues, effects) {
  const stems=Object.fromEntries(['lead','bass','arp','counter','drums','stab'].map(r=>[r,buffer(duration)]));
  const notes=[], bars=[], omittedArps=[];
  const biomeChanges=cues.scenes.filter(s=>s.theme).map(s=>({at:s.start,theme:s.theme}));
  // Measured mix refinements, without changing score timing or pitch.
  const refinements={titlePeak:1, titleStab:.10, cutStab:.65, newKick:.50, reveal:1.015, party:1.015, drive:1, climax:1, suspend:1};
  function profile(phrase, role, at, wave) {
    const p={wave,gain:1};
    if(['explore','exploreExit'].includes(phrase)) {
      const theme=biomeChanges.filter(s=>s.at<=at).at(-1)?.theme;
      if(role==='arp' && theme==='snow')p.wave='triangle';
      if(role==='arp' && theme==='desert')p.gain=10**(-3/20);
      if(role==='bass' && theme==='volcano')p.gain=10**(1/20);
      if(['snare','hat'].includes(role) && theme==='snow')p.gain=10**(-6/20);
    }
    if(phrase==='rest' && at>=17.5) {
      if(role==='lead'){p.wave='triangle';p.gain=.025/.028;}
      if(role==='arp')p.gain=10**(-3/20);
    }
    return p;
  }
  function duck(at,role) {
    let db=0;
    for(const e of effects) {
      const extra=variant==='B'&&e.time===40&&['lead','arp','counter','snare','hat'].includes(role)?1.5:0;
      const reduction=e.key==='sword'?(role==='arp'?6:3)+extra:
        e.key==='level'&&['lead','arp','counter'].includes(role)?4:
        e.key==='chest'&&role==='lead'?3:0;
      const release=e.key==='level'?.18:.12;
      const strength=Math.max(0,Math.min(1,(at-e.time+.020)/.020,(e.placeAt+e.duration+release-at)/release));
      db=Math.max(db,reduction*strength);
    }
    return 10**(-db/20);
  }
  function emit(phrase,style,bar,role,start,length,midi,gain,gate,wave,duty,beat,custom={}) {
    const attack=custom.attack??(phrase==='rest'?.025:wave==='noise'?.002:.005);
    const release=custom.release??(phrase==='rest'?.15:wave==='noise'?.004:.03);
    const decay=custom.decay??.6,pan=custom.pan??({lead:-.10,bass:0,arp:.18,counter:-.18}[role]??0);
    if(length<attack+release-1e-8)throw Error(`Envelope ${phrase}/${role}/${length}`);
    if(role==='arp'&&notes.some(n=>n.role==='lead'&&Math.abs(n.midi-midi)===1&&Math.min(n.end,start+length)-Math.max(n.start,start)>.150001))
      throw Error(`Unplanned adjacent semitone ${start}/${midi}`);
    const first=profile(phrase,role,start,wave),a=buffer(length),b=buffer(length);
    const frequency=custom.frequency??(midi?hz(midi):0),endFrequency=custom.endFrequency??frequency;
    tone(a,0,length,frequency,first.wave,gain,pan,endFrequency,duty,decay,attack,release);
    const morphable=['lead','arp'].includes(role);
    if(morphable)tone(b,0,length,frequency,first.wave==='square'?'triangle':'square',gain,pan,endFrequency,duty,decay,attack,release);
    const changes=['explore','exploreExit'].includes(phrase)?biomeChanges.map(s=>s.at):phrase==='rest'?[17.5]:[];
    for(let i=0;i<a.length/2;i++) {
      const t=start+i/rate,change=changes.find(x=>t>=x&&t<x+.1);
      const next=profile(phrase,role,t,wave),prev=change===undefined?next:profile(phrase,role,change-.0001,wave);
      const x=change===undefined?1:(t-change)/.1,g=duck(t,role);
      const sample=(j,p)=>(morphable&&p.wave!==first.wave?b[j]:a[j])*p.gain;
      a[i*2]=(sample(i*2,prev)*(1-x)+sample(i*2,next)*x)*g;
      a[i*2+1]=(sample(i*2+1,prev)*(1-x)+sample(i*2+1,next)*x)*g;
    }
    add(stems[['kick','snare','hat','tom'].includes(role)?'drums':role],a,start);
    notes.push({phrase,style,bar,role,start,end:start+length,midi,gain,gate,wave:first.wave,duty,beat,
      attack,release,decay,pan,frequency,endFrequency,ducked:true});
  }
  for(const [at,phrase,bar,style] of arrangements[variant]) {
    const s=score[phrase],cfg=styles[style],beat=60/s.bpm,beats=s.beats??s.barBeats?.[bar]??4;
    const stop=at+Math.min(beats,cfg.stopBeat??beats)*beat,level=refinements[style]??1;
    bars.push({start:at,end:at+beats*beat,phrase,bar,style,bpm:s.bpm,beats,chord:s.beats?s.arp:s.arp[bar]});
    for(const role of ['lead','bass','counter']) {
      const line=s.beats?s[role]:s[role]?.[bar];if(!line)continue;
      let pos=0;
      for(const [pitch,count] of line) {
        const c=cfg[role],start=at+pos*beat;
        if(pitch&&c&&start<stop-1e-8)
          emit(phrase,style,bar,role,start,Math.min(count*beat*c[1],stop-start),pitch,c[0]*level,c[1],c[2],c[3],pos);
        pos+=count;
      }
      if(Math.abs(pos-beats)>1e-8)throw Error(`Beats ${phrase}/${role}/${bar}`);
    }
    const chord=s.beats?s.arp:s.arp[bar];
    let pattern=arpPatterns[cfg.arpMode]??[];
    if(cfg.arpMode==='explicit') {
      let pos=0;pattern=s.arpNotes.map(([pitch,count])=>{const n=[pos,pitch,count];pos+=count;return n;});
    }
    for(const [pos,index,count] of pattern) {
      const pitch=cfg.arpMode==='explicit'?index:chord?.[index],start=at+pos*beat,c=cfg.arp;
      if(!pitch||start>=stop-1e-8)continue;
      if(arpOmissions.some(o=>Math.abs(o.at-start)<1e-8&&o.midi===pitch)) {
        omittedArps.push({start,midi:pitch,phrase,bar,reason:'Preserved v4-M2 sustained E4/F4 repair'});continue;
      }
      emit(phrase,style,bar,'arp',start,Math.min(count*beat*c[1],stop-start),pitch,c[0]*level,c[1],c[2],c[3],pos);
    }
    for(const [pos,role,gain] of percussion[cfg.drums]) {
      const start=at+pos*beat;if(start>=stop-1e-8)continue;
      const [wave,length,f,end,decay,attack,release]=drumVoices[role];
      const transientLevel=at>=34.5&&role==='kick'?refinements.newKick:1;
      emit(phrase,style,bar,role,start,Math.min(length,stop-start),0,gain*level*transientLevel,1,wave,.5,pos,
        {frequency:f,endFrequency:end,decay,attack,release});
    }
  }
  for(const [start,chord,length,gain] of stabs[variant])for(const midi of chord)
    emit('accent','accent',0,'stab',start,length,midi,gain*(start===43.6?refinements.titlePeak*refinements.titleStab:refinements.cutStab),1,accents.wave,accents.duty,0,accents);
  for(const stem of Object.values(stems))for(const g of guards)fade(stem,g.end-g.fade,g.end,g.fade);
  const samples=buffer(duration);for(const stem of Object.values(stems))add(samples,stem,0);
  notes.sort((a,b)=>a.start-b.start);
  if(notes.some(n=>n.end>49.45+1e-8))throw Error('Final 50ms must remain silent');
  return {samples,stems,notes,bars,guards,omittedArps,biomeChanges,refinements};
}
