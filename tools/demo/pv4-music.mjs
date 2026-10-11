import { score } from './pv4-score.mjs';
import { buffer, rate, tone, hz, add, fade } from './pv4-synth.mjs';
const settings = {
  explore: [.060,.78,.5,.100,.80,.018,'square','eighth',1],
  rest: [.028,.88,.5,.065,.90,.016,'triangle','long',0],
  battle: [.065,.65,.25,.115,.72,.016,'square','eighth',2],
  bossWait: [.018,.60,.5,.075,.70,0,'triangle','long',0],
  boss: [.075,.72,.25,.125,.75,.020,'square','eighth',2],
  report: [.040,.78,.5,.070,.85,.014,'triangle','long',0],
  title: [.075,.85,.5,.090,.90,.024,'triangle','long',0],
  ending: [.040,.90,.5,.065,.90,.015,'triangle','long',0],
  bridge: [.035,.8,.5,.060,.8,.014,'triangle','bridge',0],
  revealIn: [.020,.6,.5,0,.8,0,'triangle','long',0],
  shortExit: [.025,.8,.5,0,.8,0,'triangle','long',0],
  exploreExit: [.040,.85,.5,.076,.95,.0107,'square','exit',0],
};
export function renderMusic(cues, effects) {
  const start = id => { const s = cues.scenes.find(s => s.id === id); if (!s) throw Error(id); return s.start; };
  const titleAt = cues.effects.find(e => e.id === 'title-enter').time;
  const groups = [
    ['explore',start('S03'),start('S07')], ['rest',start('S07'),start('S09')],
    ['battle',start('S09'),start('S13-received')], ['report',start('S13-received'),start('S14')],
    ['bossWait',start('S14'),start('S16')], ['boss',start('S16'),start('S24')],
    ['title',titleAt,titleAt+4], ['ending',titleAt+4,cues.duration],
  ].map(([name,start,end]) => ({ name,start,end,key: ['rest','report','title'].includes(name) ? 'F lydian / D dorian' : 'D dorian' }));
  const dst = buffer(cues.duration), notes = [], bars = [], guards = [], omittedArps = [];
  const biomeChanges = cues.scenes.filter(s => s.theme).map(s => ({ at:s.start,theme:s.theme }));
  const profile = (group, role, t) => {
    let p = { wave: ['bass','kick'].includes(role) ? 'triangle' : role === 'arp' ? settings[group][6] : ['ending','bridge','shortExit'].includes(group) ? 'triangle' : 'square', gain:1, pan: role === 'lead' ? -.1 : role === 'arp' ? .18 : 0 };
    if (group === 'explore' || group === 'exploreExit') {
      const theme = biomeChanges.filter(s => s.at <= t).at(-1)?.theme;
      if (role === 'arp') { if (theme === 'snow') p.wave='triangle'; if (theme === 'desert') p.gain=10**(-3/20); }
      if (role === 'bass' && theme === 'volcano') p.gain=10**(1/20);
      if (role === 'noise' && theme === 'snow') p.gain=10**(-6/20);
    }
    if (group === 'rest' && t >= start('S08')) {
      if (role === 'lead') { p.wave='triangle'; p.gain=.025/.028; }
      if (role === 'arp') p.gain=10**(-3/20);
    }
    if (group === 'report' && t >= start('S13-received')+4) {
      if (role === 'lead') { p.wave='triangle'; p.gain=.030/.040; }
      if (role === 'arp') p.gain=10**(-3/20);
    }
    return p;
  };
  function duck(t, role) {
    let db=0;
    for (const e of effects) {
      let reduction = e.key === 'sword' ? (role === 'arp' ? 6 : 3) : e.key === 'level' && ['lead','arp'].includes(role) ? 4 : e.key === 'chest' && role === 'lead' ? 3 : 0;
      const release = e.key === 'level' ? .18 : .12;
      const strength = Math.max(0, Math.min(1,(t-e.time+.020)/.020,(e.placeAt+e.duration+release-t)/release));
      db=Math.max(db,reduction*strength);
    }
    return 10**(-db/20);
  }
  function emit(group, role, at, duration, pitch, gain, duty, gate, bar, beat, custom) {
    if (!pitch && role !== 'noise') return;
    const attack = group === 'rest' ? .025 : role === 'noise' ? .002 : .005;
    const release = group === 'rest' ? .15 : role === 'noise' ? .004 : .03;
    const length = duration*gate;
    if (role === 'arp' && notes.some(n => n.role === 'lead' && Math.abs(n.midi-pitch) === 1 && Math.min(n.end,at+length)-Math.max(n.start,at) > .150001)) {
      omittedArps.push({group,bar,beat,midi:pitch,start:at,reason:'Thin sustained adjacent-register semitone with lead per sound design'});
      return;
    }
    if (length < attack+release) throw Error(`Envelope too short: ${group}/${role}`);
    const first = profile(group,role,at), wave = role === 'noise' ? 'noise' : first.wave;
    const a=buffer(length), b=buffer(length);
    tone(a,0,length,role === 'noise' ? 0 : custom?.frequency ?? hz(pitch),wave,gain,first.pan,
      custom?.end ?? (role === 'noise' ? 0 : hz(pitch)),duty,custom?.decay ?? .6,attack,release);
    const morphable = ['lead','arp'].includes(role);
    if (morphable) tone(b,0,length,hz(pitch),wave === 'square' ? 'triangle' : 'square',gain,first.pan,undefined,duty,.6,attack,release);
    const changes = ['explore','exploreExit'].includes(group) ? biomeChanges.map(s=>s.at) : group === 'rest' ? [start('S08')] : group === 'report' ? [start('S13-received')+4] : [];
    for (let i=0;i<a.length/2;i++) {
      const t=at+i/rate, change=changes.find(x=>t>=x && t<x+.1);
      const next=profile(group,role,t), prev=change === undefined ? next : profile(group,role,change-.0001);
      const x=change === undefined ? 1 : (t-change)/.1;
      const sample=(c,p) => (morphable && p.wave!==wave ? b[c] : a[c])*p.gain;
      const g=duck(t,role);
      a[i*2]=(sample(i*2,prev)*(1-x)+sample(i*2,next)*x)*g;
      a[i*2+1]=(sample(i*2+1,prev)*(1-x)+sample(i*2+1,next)*x)*g;
    }
    add(dst,a,at);
    notes.push({group,role,start:at,end:at+length,midi:pitch,wave,gain,duty,gate,bar,beat,attack,release,
      frequency:custom?.frequency ?? (pitch ? hz(pitch) : 0),morphable,ducked:true});
  }
  function play(name, bar, at, parent) {
    const s=score[name], beat=60/s.bpm, special=s.beats, cfg=settings[name];
    bars.push({group:parent,phrase:name,bar,start:at,end:at+(special??4)*beat,bpm:s.bpm,beats:special??4,chord:s.arp[bar]??s.arp});
    for (const role of ['lead','bass']) {
      let pos=0; const line=special ? s[role] : s[role][bar];
      for (const [pitch,beats] of line) {
        emit(name,role,at+pos*beat,beats*beat,pitch,role==='lead'?cfg[0]:cfg[3],role==='lead'?cfg[2]:.5,role==='lead'?cfg[1]:cfg[4],bar,pos);
        pos+=beats;
      }
    }
    const arp=special ? s.arp : s.arp[bar];
    if (s.arpNotes) {
      let pos=0;
      for (const [pitch,beats] of s.arpNotes) {
        emit(name,'arp',at+pos*beat,beats*beat,pitch,cfg[5],.25,.6,bar,pos);pos+=beats;
      }
      for (const pos of [0,1,2]) emit(name,'kick',at+pos*beat,.09,1,.050,.5,1,bar,pos,{frequency:90,end:45,decay:4});
    } else if (arp?.length && !(name==='boss' && at===groups.find(g=>g.name==='boss').start)) {
      const offsets=cfg[7]==='eighth'?[0,.5,1,1.5,2,2.5,3,3.5]:cfg[7]==='bridge'?[0]:[0,2];
      offsets.forEach((pos,i)=>emit(name,'arp',at+pos*beat,(cfg[7]==='eighth'?.30:cfg[7]==='bridge'?.7:1.7)*beat,
        arp[(cfg[7]==='eighth'?[0,2,1,3,0,2,1,3]:[0,2])[i]],cfg[5],name==='explore'?.25:.5,1,bar,pos));
    }
    if (cfg[8]) {
      const p3=name==='boss' && at>=groups.find(g=>g.name==='boss').start+4;
      for (const pos of [0,2]) emit(name,'kick',at+pos*beat,.09,1,cfg[8]===1?.050:.075,.5,1,bar,pos,{frequency:90,end:45,decay:4});
      for (const pos of [1,3]) emit(name,'noise',at+pos*beat,.045,0,cfg[8]===1?.025:.055,.5,1,bar,pos,{decay:5});
      for (const pos of [.5,1.5,2.5,3.5]) emit(name,'noise',at+pos*beat,.020,0,cfg[8]===1?.015:p3&&pos===3.5?.032:.022,.5,1,bar,pos,{decay:5});
    }
  }
  for (const g of groups) {
    const width=240/score[g.name].bpm, count=Math.floor((g.end-g.start+.00001)/width);
    for (let b=0;b<count;b++) play(g.name,b%score[g.name].lead.length,g.start+b*width,g.name);
    const rem=+(g.end-g.start-count*width).toFixed(4), at=g.start+count*width;
    if (g.name==='explore' && rem===1.5) play('exploreExit',0,at,g.name);
    else if (rem===1 || rem===1.5) { play(g.name==='bossWait'?'revealIn':'bridge',0,at,g.name); if (rem===1.5) play('shortExit',0,at+1,g.name); }
    else if (rem===.5) play('shortExit',0,at,g.name);
    else if (g.name==='ending' && rem===1.9) play('ending',0,at,g.name);
    else if (rem!==0) throw Error(`Review non-musical remainder ${g.name}: ${rem}`);
    const close=g.name==='bossWait'?.1:['rest','explore'].includes(g.name)?.2:.12;
    fade(dst,g.end-close,g.end,close);
    guards.push({at:g.end,fadeSeconds:close,note:'Out-leading linear fade; incoming envelope follows cue, no beat shifted'});
  }
  fade(dst,cues.duration-.5,cues.duration,.5);
  return {samples:dst,notes,bars,groups,guards,biomeChanges,omittedArps};
}
