// Adopted B score. Data only; [MIDI, quarter-note beats], 0 = rest.
// Original accompaniment and connecting phrases; Beethoven's public-domain melody.
import { score as frontScore } from './front-score.mjs';
// Editorial v3 metadata changed; all seven sound anchors and every score note stay fixed.
export const cueHash = '0503041ec3dcc7b647a1f7dc4c6d853e2e394d3c741036f93a56005ff17a255a';
export const duration = 49.5;
// Straight octave/fifth bass. The scores below, not a generative music system.
const pulse = root => [root,root+7,root+12,root+7,root,root+7,root+12,root+7].map(n=>[n,.5]);
const silent = [[0,4]];
const tailBeats = 56/15; // 48.1–49.5 at 160 BPM; no whole-song time stretch.
const bassB = [40,47,45,47,47,47].map(pulse);
const harmonyB = [[64,68,71,76],[59,63,66,69],[57,61,64,68],[59,63,66,71],[59,63,66,69],[59,63,66,69]];
// Beethoven Op.125 IV, principal Freude melody, original D major -> E major.
// Original pitch skeleton: F# F# G A | A G F# E | D D E F# | F#(1.5) E(.5) E(2).
// Memory transcription of the composer's melody; no recording or modern edition used.
const joyHead = [
  [[80,1],[80,1],[81,1],[83,1]],
  [[83,1],[81,1],[80,1],[78,1]],
  [[76,1],[76,1],[78,1],[80,1]],
];
const originalLift = [
  [[78,.5],[80,.5],[81,.5],[78,.5],[75,.5],[78,.5],[71,.5],[0,.5]],
  [[75,.5],[78,.5],[81,.5],[78,.5],[71,1],[0,1]],
];
export const score = {
  ...frontScore,
  wait: {bpm:120,lead:[silent],bass:[[[50,.75],[0,3.25]]],arp:[]},
  pickup: {bpm:120,beats:2,
    lead:[[0,.5],[66,.5],[75,.5],[0,.5]],bass:[[47,1.5],[0,.5]],arp:[]},
  bossB: {bpm:160,lead:[...joyHead,[[80,1.5],[78,.5],[78,2]],...originalLift],
    bass:bassB,arp:harmonyB,counter:[silent,
      [[63,1],[66,1],[71,1],[66,1]], [[64,1],[61,1],[64,1],[68,1]],
      [[63,1],[66,1],[59,1],[66,1]], [[63,.5],[66,.5],[69,1],[66,.5],[63,.5],[59,1]],
      [[63,1],[66,1],[59,1],[0,1]],
    ]},
  titleB: {bpm:160,barBeats:[4,4,4,tailBeats],lead:[
    ...joyHead,[[78,1.5],[76,.5],[76,1.5],[0,7/30]],
  ],bass:[pulse(40),pulse(47),[[45,1],[52,1],[57,1],[52,1]],[[47,1.5],[40,2],[0,7/30]]],
    arp:[[64,68,71,76],[59,63,66,69],[57,61,64,68],[64,68,71,76]],counter:[
      [[64,1],[68,1],[71,1],[68,1]], [[63,1],[66,1],[71,1],[66,1]],
      [[64,2],[61,2]], [[66,1.5],[64,2],[0,7/30]],
    ]},
};
// Opening 31.5s, including the repaired 3-beat walking exit.
// Row = [absolute seconds, phrase, zero-based bar, style]. Boss rows are 1.5s apart.
const front = [
  [2,'explore',0,'explore'],[4,'explore',1,'explore'],[6,'explore',2,'explore'],
  [8,'explore',3,'explore'],[10,'explore',0,'explore'],[12,'explore',1,'explore'],
  [14,'exploreExit',0,'exploreExit'],[15.5,'rest',0,'rest'],
  [19.5,'battle',0,'battle'],[21.5,'battle',1,'battleLift'],
  [23.5,'report',0,'report'],[25.5,'report',1,'report'],
  [27.5,'report',0,'reportRead'],[29.5,'report',1,'reportRead'],
  [31.5,'wait',0,'wait'],[33.5,'pickup',0,'pickup'],
];
export const arrangements = {};
for (const variant of ['B']) arrangements[variant] = [
  ...front,
  ...[34.5,36,37.5,39,40.5,42].map((at,i)=>[at,`boss${variant}`,i,['reveal','party','drive','drive','climax','suspend'][i]]),
  ...[43.6,45.1,46.6,48.1].map((at,i)=>[at,`title${variant}`,i,['titlePeak','titleCarry','titleEase','tail'][i]]),
];
// Per voice: gain, gate, wave, duty. Pan lead=-.10/bass=0/arp=.18/counter=-.18.
// Only initial levels: render and measure, then alter arrangement, not every stem's LUFS.
export const styles = {
  explore: {lead:[.060,.78,'square',.5],bass:[.100,.80,'triangle',.5],arp:[.018,1,'square',.25],arpMode:'eighth',drums:'P1'},
  exploreExit: {lead:[.040,.85,'square',.5],bass:[.076,.95,'triangle',.5],arp:[.0107,.6,'square',.25],arpMode:'explicit',drums:'walkExit'},
  rest: {lead:[.028,.88,'square',.5],bass:[.065,.90,'triangle',.5],arp:[.016,1,'triangle',.5],arpMode:'long',drums:'none'},
  battle: {lead:[.065,.65,'square',.25],bass:[.115,.72,'triangle',.5],arp:[.016,1,'square',.5],arpMode:'eighth',drums:'P2'},
  battleLift: {lead:[.065,.65,'square',.25],bass:[.115,.72,'triangle',.5],arp:[.013,1,'square',.5],arpMode:'sixteenth',drums:'P2'},
  report: {lead:[.040,.78,'square',.5],bass:[.070,.85,'triangle',.5],arp:[.014,1,'triangle',.5],arpMode:'long',drums:'none'},
  reportRead: {lead:[.030,.78,'triangle',.5],bass:[.070,.85,'triangle',.5],arp:[.00991,1,'triangle',.5],arpMode:'long',drums:'none'},
  wait: {lead:[0,.75,'triangle',.5],bass:[.065,.8,'triangle',.5],arpMode:'none',drums:'none'},
  pickup: {lead:[.038,.72,'square',.5],bass:[.075,.85,'triangle',.5],arpMode:'none',drums:'pickup'},
  reveal: {lead:[.074,.78,'square',.25],bass:[.125,.75,'triangle',.5],arp:[.017,1,'square',.5],arpMode:'eighth',drums:'P3'},
  party: {lead:[.076,.78,'square',.25],bass:[.130,.75,'triangle',.5],arp:[.017,1,'square',.5],counter:[.024,.75,'triangle',.5],arpMode:'eighth',drums:'P3'},
  drive: {lead:[.078,.76,'square',.25],bass:[.135,.75,'triangle',.5],arp:[.016,1,'square',.5],counter:[.026,.72,'triangle',.5],arpMode:'sixteenth',drums:'P3'},
  climax: {lead:[.081,.76,'square',.25],bass:[.140,.78,'triangle',.5],arp:[.019,1,'square',.5],counter:[.028,.75,'square',.5],arpMode:'sixteenth',drums:'P4'},
  suspend: {lead:[.078,.75,'square',.25],bass:[.135,.75,'triangle',.5],arp:[.017,1,'square',.5],counter:[.025,.7,'triangle',.5],arpMode:'sixteenth',drums:'P4',stopBeat:3},
  titlePeak: {lead:[.090,.88,'square',.5],bass:[.148,.83,'triangle',.5],arp:[.022,1,'square',.25],counter:[.034,.82,'square',.5],arpMode:'sixteenth',drums:'P5'},
  titleCarry: {lead:[.083,.86,'square',.5],bass:[.132,.80,'triangle',.5],arp:[.018,1,'square',.25],counter:[.028,.80,'triangle',.5],arpMode:'sixteenth',drums:'P3'},
  titleEase: {lead:[.063,.88,'square',.5],bass:[.100,.88,'triangle',.5],arp:[.015,1,'triangle',.5],counter:[.022,.82,'triangle',.5],arpMode:'eighth',drums:'P1'},
  tail: {lead:[.047,.88,'triangle',.5],bass:[.078,.92,'triangle',.5],arp:[.013,1,'triangle',.5],counter:[.018,.82,'triangle',.5],arpMode:'tail',drums:'none'},
};
// [onset beat, chord index, note duration beats]; note duration is NOT step size.
export const arpPatterns = {
  eighth: Array.from({length:8},(_,i)=>[i*.5,[0,2,1,3][i%4],.30]),
  sixteenth: Array.from({length:16},(_,i)=>[i*.25,[0,2,1,3][i%4],.17]),
  long: [[0,0,1.7],[2,2,1.7]],
  tail: [[0,0,1.7],[2,2,1.6]], // final arp ends at 49.45; last 50ms silent.
};
// Avoid two sustained adjacent semitones (E4 lead vs F4 arp).
export const arpOmissions = [{at:26.5,midi:65},{at:30.5,midi:65}];
// Each percussion hit is [beat, type, gain]; no sampled drums or invented game SE.
const drums = (kick,snare,hat,extra=[]) => [
  ...[0,2].map(b=>[b,'kick',kick]), ...[1,3].map(b=>[b,'snare',snare]),
  ...[.5,1.5,2.5,3.5].map(b=>[b,'hat',hat]), ...extra,
];
export const percussion = {
  none:[], walkExit:[0,1,2].map(b=>[b,'kick',.050]),
  pickup:[[1,'tom',.055],[1.25,'snare',.035],[1.5,'snare',.040]],
  P1:drums(.050,.025,.015), P2:drums(.075,.055,.022),
  P3:drums(.090,.060,.024,[[2.75,'hat',.015]]),
  P4:drums(.100,.065,.026,[[1.75,'kick',.055],[3.25,'snare',.030]]),
  P5:drums(.115,.075,.030,[[1.75,'kick',.060],[2.75,'hat',.018],[3.25,'snare',.032]]),
};
// wave, seconds, start Hz, end Hz, decay, attack, release; polyBLEP synth API.
export const drumVoices = {
  kick:['triangle',.11,105,48,4,.003,.020],
  tom:['triangle',.13,160,82,3.8,.003,.025],
  snare:['noise',.070,0,0,4.5,.002,.006],
  hat:['noise',.022,0,0,5,.002,.004],
};
// Editorial music accents on real cuts, not additional events. Gain is PER pitch.
export const stabs = {
  B:[[34.5,[52,59,68],.105,.014],[37.5,[57,64,68],.10,.015],
     [40.5,[59,66,69],.12,.017],[43.6,[52,59,68,76],.22,.021]],
};
export const accents = {wave:'square',duty:.5,gate:1,pan:0,decay:1.4,attack:.005,release:.035};
// Mandatory timing guards, applied per group to dry BGM, not per bar.
export const guards = [
  {end:15.5,fade:.2},{end:19.5,fade:.2},{end:23.5,fade:.12},{end:31.5,fade:.12},
  {end:34.35,fade:.08}, // 150ms complete gap before party release.
  {end:43.3,fade:.12}, // last boss attacks stop at 43.125; 300ms to title entry.
  {end:49.5,fade:.5},
];
