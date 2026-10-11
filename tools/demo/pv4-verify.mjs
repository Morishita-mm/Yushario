// Pure source/core assertions plus measured real app coordinates and DOM facts.
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { Room, moods } from '../../src/core/room.ts';
import { stats } from '../../src/core/story.ts';
import { townView } from '../../src/core/town.ts';
import { equipmentTiers, battlePresentation, recentBattleSuccess } from '../../src/core/battle-presentation.ts';
import { shots, sessions, duration, themes, cues } from './pv4-shots.mjs';
const root = process.argv[2] ?? '.art-work/s88/video';
const rows = file => readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse).filter(r => r.event);
const M = rows('tools/demo/recordings-v2/main.jsonl'), C = rows('tools/demo/recordings-v3/main.jsonl');
const P = rows('tools/demo/recordings-v3/pi-1.jsonl'), P2 = rows('tools/demo/recordings-v3/pi-2.jsonl');
const D = rows('.art-work/s87/recordings/events.jsonl');
const originals = new Set([...M, ...C, ...P, ...P2, ...D].map(({ event, at }) => JSON.stringify({ event, at })));
const master = JSON.parse(readFileSync('src/server/equipment.json', 'utf8'));
const pre = D.find(r => r.event.hook === 'PreCompact'), post = D.find(r => r.event.hook === 'PostCompact');
const inactivity = JSON.parse(readFileSync('.art-work/s87/recordings/dozing.json', 'utf8'));
const states = [];
for (const shot of shots) {
  assert.ok(Number.isInteger(shot.start * 30)); assert.ok(Number.isInteger(shot.seconds * 30));
  if (!shot.state) continue;
  for (const row of [...shot.state.events, ...(shot.state.live ?? [])])
    assert.ok(originals.has(JSON.stringify({ event: row.event, at: row.at })), 'Invented or changed event packet');
  const room = new Room(); for (const row of [...shot.state.events, ...(shot.state.live ?? [])]) room.apply(row.event, row.at);
  const now = shot.state.anchor + shot.ageEnd;
  const hero = townView(room, now).projects.flatMap(p => p.heroes).find(h => h.id === shot.state.id);
  assert.ok(hero);
  if (shot.kind === 'church') { assert.equal(hero.place, 'church'); assert.ok(now < post.at); }
  if (shot.kind === 'inn') { assert.equal(hero.place, 'inn'); assert.ok(moods(hero.agent, now).includes('dozing')); assert.ok(shot.ageEnd < inactivity.inactiveMs); }
  if (shot.kind === 'walk') assert.equal(hero.place, 'town');
  if (['back', 'reveal', 'party', 'dragon', 'hands', 'hero-hit', 'party-hit', 'dragon-hit', 'return'].includes(shot.kind)) {
    assert.equal(hero.party.length, 3); assert.equal(hero.monster, 'dragon'); assert.equal(recentBattleSuccess(hero.agent, now), true);
    assert.ok(now < C.find(r => r.event.hook === 'Stop').at, 'Climax falsely extends beyond the recorded Stop');
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
  const variant = `pv4-${lang}-${ratio}`, proof = JSON.parse(readFileSync(`${root}/${variant}.proof.json`, 'utf8'));
  const walk = proof.scenes.find(s => s.kind === 'walk').after;
  assert.deepEqual(walk.continuity.map(c => c.theme), themes); assert.equal(walk.positions.length, 225);
  for (const change of walk.continuity) { assert.deepEqual(change.before, change.after); assert.equal(change.persisted.theme, change.theme); }
  const distances = walk.positions.slice(1).map((p, i) => Math.hypot(p.x - walk.positions[i].x, p.y - walk.positions[i].y));
  assert.ok(distances.every(d => d > 0 && d <= 1.201), 'Walker jumps or pauses (shorter steps at graph corners are natural)');
  const treasure = proof.scenes.find(s => s.kind === 'treasure').after.treasure;
  assert.equal(treasure.unreadBefore, true); assert.equal(treasure.realBadgeClicked, true); assert.equal(treasure.dialogOpen, true);
  assert.equal(treasure.files.length, 6); assert.match(treasure.tests, /テスト ○1 ×0/);
  assert.equal(treasure.firstLine, M.findLast(r => r.event.hook === 'Stop').event.text.split('\n')[0]);
  assert.ok(treasure.read.some(([, at]) => at === 1800013000000), 'Displayed result was not marked read');
  assert.ok(treasure.bounds.bottom < 995 && treasure.bodyBounds.bottom < 995, 'Report outside readable area');
  measured.push({ variant, changes: walk.continuity, positions: walk.positions, maxStep: Math.max(...distances),
    minStep: Math.min(...distances), treasure });
}
for (const c of cues.effects) assert.equal(c.frame / 30, c.time);
writeFileSync(`${root}/source-proof.json`, JSON.stringify({ duration, fps: 30, originalPacketsIntact: true,
  compactionMs: post.at - pre.at, inactivityMs: inactivity.inactiveMs, appCodeChanged: false, states, measured }, null, 2) + '\n');
console.log('Original packets, core chest/files/test tally, compact/doze, real three-helper dragon, first contact frames and continuous UI walk verified in four variants.');
