// Pure source/core assertions plus measured real app coordinates and DOM facts.
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { Room, moods } from '../../../src/core/room.ts';
import { stats } from '../../../src/core/story.ts';
import { townView } from '../../../src/core/town.ts';
import { nearestRoadPoint } from '../../../src/core/walking.ts';
import { equipmentTiers, battlePresentation, recentBattleSuccess } from '../../../src/core/battle-presentation.ts';
import { shots, sessions, duration, themes, cues } from './shots.mjs';
import { main, party, pi, townPi, demo as D, inactivity } from './sources.mjs';
const [M, C, P, P2] = [main, party, pi, townPi].map(rows => rows.filter(r => r.event));
const root = process.argv[2] ?? '.art-work/pv/video';
const originals = new Set([...M, ...C, ...P, ...P2, ...D].map(({ event, at }) => JSON.stringify({ event, at })));
const master = JSON.parse(readFileSync('src/server/equipment.json', 'utf8'));
const townArt = JSON.parse(readFileSync('public/art/manifest.json')).find(s => s.id === 'bld-inn').town;
const villageRoads = townArt.looks.village.layout;
const pre = D.find(r => r.event.hook === 'PreCompact'), post = D.find(r => r.event.hook === 'PostCompact');
const states = [];
for (const shot of shots) {
  assert.ok(Number.isInteger(shot.start * 30)); assert.ok(Number.isInteger(shot.seconds * 30));
  if (!shot.state) continue;
  for (const row of [...shot.state.events, ...(shot.state.live ?? [])])
    assert.ok(originals.has(JSON.stringify({ event: row.event, at: row.at })), 'Invented or changed event packet');
  const room = new Room();
  for (const row of [...shot.state.events, ...(shot.state.live ?? [])]) {
    const alias = shot.state.projectAliases?.[row.event.agent];
    room.apply(alias ? { ...row.event, project: alias, name: alias } : row.event, row.at + (shot.state.receiptShift?.[row.event.agent] ?? 0));
  }
  if (shot.kind === 'world') assert.equal(townView(room, shot.state.anchor).projects.length, 5);
  if (['town', 'heroes'].includes(shot.kind)) assert.equal(townView(room, shot.state.anchor).projects[0].heroes.filter(h => h.place === 'town').length, 4);
  const now = shot.state.anchor + shot.ageEnd;
  const hero = townView(room, now).projects.flatMap(p => p.heroes).find(h => h.id === shot.state.id);
  assert.ok(hero);
  if (shot.kind === 'church') { assert.equal(hero.place, 'church'); assert.ok(now < post.at); }
  if (shot.kind === 'inn') { assert.equal(hero.place, 'inn'); assert.ok(moods(hero.agent, now).includes('dozing')); assert.ok(shot.ageEnd < inactivity.inactiveMs); }
  if (shot.kind === 'walk') assert.equal(hero.place, 'town');
  if (['back', 'challenge', 'reveal', 'party', 'dragon', 'hands', 'hero-hit', 'party-hit', 'dragon-hit', 'return'].includes(shot.kind)) {
    assert.deepEqual([...hero.party].sort(), ['thief', 'warrior', 'mage', 'priest'].sort());
    assert.equal(hero.monster, 'dragon'); assert.equal(recentBattleSuccess(hero.agent, now), true);
    assert.ok(now < C.findLast(r => r.event.hook === 'Stop').at, 'Climax falsely extends beyond the recorded final Stop');
  }
  if (['hit', 'hero-hit', 'dragon-hit', 'party-hit'].includes(shot.kind)) {
    const session = sessions.find(s => s.id === hero.agent.terminal), tiers = equipmentTiers(session, master[session.preset]);
    const offset = shot.kind === 'hit' && shot.seconds === 0.5 ? 0 : 500;
    const strike = shot.kind === 'party-hit' ? 2800 : 500 + battlePresentation(tiers, true, Math.floor(shot.motion / 9000)).windup;
    const phase = (shot.motion + offset) % 9000;
    assert.ok(phase > strike && phase - strike < 1000 / 30, 'Cue not on first contact frame');
    if (offset) assert.ok(phase - 1000 / 30 <= strike, 'Contact already visible before cue');
  }
  if (shot.kind === 'treasure') {
    const reply = hero.agent.talk.at(-1); assert.equal(reply.report.kind, 'chest'); assert.equal(reply.report.files.length, 6);
    assert.deepEqual(reply.report.tests, { passed: 1, failed: 0 }); assert.equal(reply.report.tools, 13);
    assert.equal(reply.text, M.findLast(r => r.event.hook === 'Stop').event.text);
  }
  states.push({ cut: shot.number, kind: shot.kind, place: hero.place, monster: hero.monster, helpers: hero.party.length,
    level: stats(hero.agent, now).level, origin: shot.state.origin });
}
const measured = [];
for (const lang of ['ja', 'en']) for (const ratio of ['16x9', '1x1']) {
  const variant = `source-${lang}-${ratio}`, proof = JSON.parse(readFileSync(`${root}/${variant}.proof.json`, 'utf8'));
  const walk = proof.scenes.find(s => s.kind === 'walk').after;
  assert.deepEqual(walk.continuity.map(c => c.theme), themes); assert.equal(walk.positions.length, 225);
  for (const [i, change] of walk.continuity.entries()) {
    assert.equal(change.persisted.theme, change.theme); assert.equal(change.frame, 240 + i * 45);
    assert.equal(change.transition, 'continuous walk / fixed camera / native theme change');
    assert.deepEqual(change.before, change.after, 'Theme changes move the hero');
  }
  const townSteps = themes.map((theme, i) => {
    const positions = walk.positions.filter(p => p.theme === theme);
    assert.equal(positions.length, 45); assert.equal(positions[0].frame, 240 + i * 45);
    assert.ok(Math.hypot(positions[0].x - walk.continuity[i].after.x, positions[0].y - walk.continuity[i].after.y) <= 1.201);
    const distances = positions.slice(1).map((p, j) => Math.hypot(p.x - positions[j].x, p.y - positions[j].y));
    assert.ok(distances.every(d => d > 0 && d <= 1.201), `${theme}: Walker jumps or pauses within a town cut`);
    return { theme, firstFrame: positions[0].frame, lastFrame: positions.at(-1).frame,
      minStep: Math.min(...distances), maxStep: Math.max(...distances) };
  });
  const allSteps = walk.positions.slice(1).map((p, i) => Math.hypot(p.x - walk.positions[i].x, p.y - walk.positions[i].y));
  assert.ok(allSteps.every(d => d > 0 && d <= 1.201), 'Cross-town walking jumps or stops');
  assert.ok(walk.positions.slice(1).every((p, i) => Math.abs(p.motion - walk.positions[i].motion - 1000 / 30) < .001));
  const clocks = proof.scenes.at(-1).after.clocks;
  assert.ok(clocks.slice(1).every((c, i) => c.motion >= clocks[i].motion), 'Filming clock rewinds');
  // Opaque sprite bounds and actual name text projected through the exact camera transform.
  // Checking movement alone cannot detect a hero walking outside the completed picture.
  const framing = proof.scenes.at(-1).after.framing;
  const margin = (bounds, frame) => {
    const [x, y, w, h] = frame.destination;
    return Math.min(bounds[0] - Math.max(0, x), bounds[1] - Math.max(0, y),
      Math.min(proof.width, x + w) - bounds[2], Math.min(1080, y + h) - bounds[3]);
  };
  const visible = (actor, frame) => {
    const [left, top, right, bottom] = actor.bounds;
    return left >= 0 && top >= 0 && right <= frame.sourceSize[0] && bottom <= frame.sourceSize[1] && margin(actor.output, frame) >= 24;
  };
  const towns = framing.filter(f => f.kind === 'biome' && f.frame >= 240 && f.frame < 465);
  assert.deepEqual(towns.map(f => f.frame), Array.from({ length: 225 }, (_, i) => 240 + i));
  for (const frame of towns) {
    const hero = frame.actors.filter(a => ['hero-walk', 'hero-walk-back'].includes(a.sheet));
    assert.equal(hero.length, 1, 'Missing genuine walking hero draw');
    assert.equal(hero[0].facing, 'right', 'Theme change reverses the walk');
    assert.ok(frame.actors.some(a => a.sheet === 'ui-weapons'), 'Missing name-side sword draw');
    assert.ok(frame.actors.every(a => visible(a, frame)), `Town hero/sword cropped at f${frame.frame}`);
    assert.ok(frame.name && margin(frame.name, frame) >= 24, `Town name cropped at f${frame.frame}`);
    assert.deepEqual(frame.crop, towns[0].crop, 'Town camera cuts or tracks');
    assert.deepEqual(frame.destination, towns[0].destination, 'Town scale changes');
  }
  const introductions = framing.filter(f => f.kind === 'heroes');
  assert.equal(introductions.length, 60);
  for (const frame of introductions) {
    const heroes = frame.actors.filter(a => a.sheet.startsWith('hero-') && visible(a, frame));
    assert.ok(heroes.length >= 2 && heroes.filter(a => a.output[3] - a.output[1] >= 130).length >= 2, 'Introduction lost its two close-up heroes');
    assert.ok(frame.introduction.length === 2 && frame.introduction.every(p => margin(p.bounds, frame) >= 24));
  }
  const crowd = framing.filter(f => ['town', 'heroes'].includes(f.kind));
  assert.equal(crowd.length, 120);
  for (const frame of crowd) for (const hero of frame.townHeroes) {
    assert.ok(nearestRoadPoint(villageRoads, hero.x, hero.y).distance < .001, 'Hero leaves actual village road');
    assert.ok(Math.hypot(hero.x - 480, hero.y - 260) >= 42, 'Hero walks over fountain');
    if (frame.kind === 'town') assert.ok(margin(hero.output, frame) >= 24, 'Town crowd label cropped');
  }
  const back = framing.filter(f => f.kind === 'back');
  assert.equal(back.length, 60);
  for (const frame of back) assert.ok(visible(frame.actors.find(a => a.sheet === 'hero-back-battle'), frame), 'Back close-up loses hero');
  const pullback = framing.filter(f => ['challenge', 'reveal', 'party'].includes(f.kind));
  assert.equal(pullback.length, 120);
  for (const [i, frame] of pullback.entries()) {
    const dragon = frame.actors.find(a => a.sheet === 'monster-dragon');
    assert.ok(dragon && visible(dragon, frame), 'Continuous pullback loses dragon');
    if (i) assert.ok(frame.crop[2] >= pullback[i - 1].crop[2], 'Pullback cuts back in');
    if (i > 30 && i < 60) assert.ok(frame.crop.every((v, j) => Math.abs(v - pullback[i - 1].crop[j]) < 40), 'Pullback jumps');
  }
  for (const [a, b] of [[29, 30], [59, 60]]) {
    assert.deepEqual(pullback[a].crop, pullback[b].crop, 'Dragon/reveal/party crops do not join');
    assert.deepEqual(pullback[a].destination, pullback[b].destination, 'Reveal scale cuts at boundary');
  }
  const parties = framing.filter(f => ['party', 'hero-hit', 'return'].includes(f.kind));
  assert.equal(parties.length, 120);
  for (const frame of parties) {
    const actors = frame.actors.filter(a => a.sheet === 'hero-back-battle' || a.sheet.startsWith('party-'));
    assert.deepEqual(actors.map(a => a.sheet).sort(), ['hero-back-battle', 'party-thief-back', 'party-warrior-back', 'party-mage-back', 'party-priest-back'].sort());
    assert.ok(actors.every(a => visible(a, frame)), `Party cropped at f${frame.frame}`);
    assert.ok(actors.every(a => frame.destination[1] + frame.destination[3] - a.output[3] >= 50), 'Party feet have no room below');
  }
  const framingSummary = { townFrames: towns.length, introductionFrames: introductions.length, partyFrames: parties.length,
    townMinMargin: Math.min(...towns.flatMap(f => [...f.actors.map(a => margin(a.output, f)), margin(f.name, f)])),
    partyMinFootRoom: Math.min(...parties.flatMap(f => f.actors.filter(a => a.sheet.includes('back')).map(a => f.destination[1] + f.destination[3] - a.output[3]))) };
  const titles = proof.scenes.at(-1).after.titles;
  assert.equal(titles.length, 180);
  for (const [i, title] of titles.entries()) {
    assert.equal(title.smoothing, false); assert.equal(title.revealed % 6, 0);
    assert.equal(title.tagline, title.frame >= 1341);
    if (i) assert.ok(title.revealed >= titles[i - 1].revealed, 'Logo wipe reverses');
  }
  assert.equal(titles[0].revealed, 0); assert.equal(titles[36].revealed, 684);
  assert.ok(proof.textChecks.every(({ line }) => !/実記録|実際の報告|recordings|report enlarged/.test(line)));
  const notice = proof.scenes.find(s => s.kind === 'level').after.noticeProof;
  assert.match(notice.text, /レベル3に あがった！/);
  assert.ok(notice.bounds[0] >= 0 && notice.bounds[2] <= proof.width && notice.bounds[3] < 1080,
    'Genuine level-up DOM line is outside the captured screenshot');
  const treasure = proof.scenes.find(s => s.kind === 'treasure').after.treasure;
  assert.equal(treasure.unreadBefore, true); assert.equal(treasure.realBadgeClicked, true); assert.equal(treasure.dialogOpen, true);
  assert.equal(treasure.files.length, 6); assert.match(treasure.tests, /テスト ○1 ×0/);
  assert.equal(treasure.firstLine, M.findLast(r => r.event.hook === 'Stop').event.text.split('\n')[0]);
  assert.ok(treasure.read.some(([, at]) => at === 1800013000000), 'Displayed result was not marked read');
  assert.ok(treasure.bounds.bottom < 995 && treasure.bodyBounds.bottom < 995, 'Report outside readable area');
  assert.equal(treasure.bodyTextIntact, true);
  assert.ok(treasure.bodyBounds.bottom >= treasure.conclusionBounds.bottom && treasure.bodyBounds.bottom - treasure.conclusionBounds.bottom <= 5,
    'Report must show the entire conclusion without the following detail heading');
  measured.push({ variant, framing: framingSummary, changes: walk.continuity, positions: walk.positions, townSteps,
    maxStep: Math.max(...townSteps.map(s => s.maxStep)), minStep: Math.min(...townSteps.map(s => s.minStep)), notice, treasure });
}
for (const c of cues.effects) assert.equal(c.frame / 30, c.time);
writeFileSync(`${root}/source-proof.json`, JSON.stringify({ duration, fps: 30, originalPacketsIntact: true,
  compactionMs: post.at - pre.at, inactivityMs: inactivity.inactiveMs, appCodeChanged: false, states, measured }, null, 2) + '\n');
console.log('Original packets/core, five mapped towns, four genuine town heroes, 225 continuous walking frames, 60 introduction frames, 120 uninterrupted dragon-to-party frames, 120 uncropped five-person party frames and 180 pixel-wipe/title frames and genuine report verified in each of four variants.');
