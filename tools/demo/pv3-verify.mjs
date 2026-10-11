// Pure core/source checks; no fabricated events, success, level, helper or dozing activity.
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { Room, MOOD_RULES, moods } from '../../src/core/room.ts';
import { stats } from '../../src/core/story.ts';
import { townView } from '../../src/core/town.ts';
import { recentBattleSuccess, battlePresentation, equipmentTiers } from '../../src/core/battle-presentation.ts';
import { shots, sessions, duration } from './pv3-shots.mjs';
const root = process.argv[2] ?? '.art-work/s87';
const rows = file => readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
const M = rows('tools/demo/recordings-v2/main.jsonl'), C = rows('tools/demo/recordings-v3/main.jsonl');
const P = rows('tools/demo/recordings-v3/pi-1.jsonl'), P2 = rows('tools/demo/recordings-v3/pi-2.jsonl');
const D = rows(`${root}/recordings/events.jsonl`).filter(r => r.event);
const original = new Set([...M, ...C, ...P, ...P2, ...D].filter(r => r.event).map(r => JSON.stringify({ event: r.event, at: r.at })));
const master = JSON.parse(readFileSync('src/server/equipment.json', 'utf8'));
const doze = JSON.parse(readFileSync(`${root}/recordings/dozing.json`, 'utf8'));
const biomes = JSON.parse(readFileSync(`${root}/recordings/biomes.json`, 'utf8'));
assert.ok(doze.inactiveMs > MOOD_RULES.dozingMs); assert.equal(doze.clockChanged, false);
assert.deepEqual(biomes.map(b => b.theme), ['village', 'port', 'snow', 'desert', 'volcano']);
for (const b of biomes) { assert.equal(b.town.theme, b.theme); assert.ok(b.before.includes('町のすがたを かえる'), 'Real theme UI entry missing'); }
const pre = D.find(r => r.event.hook === 'PreCompact'), post = D.find(r => r.event.hook === 'PostCompact');
assert.ok(post.at > pre.at); const result = [];
for (const shot of shots) {
  assert.equal(shot.start * 30 % 5, 0); assert.equal((shot.start + shot.seconds) * 30 % 5, 0);
  if (!shot.state) continue;
  for (const row of [...shot.state.events, ...(shot.state.live ?? [])]) assert.ok(original.has(JSON.stringify({ event: row.event, at: row.at })), 'New/edited packet');
  const room = new Room();
  for (const { event, at } of [...shot.state.events, ...(shot.state.live ?? [])]) room.apply(event, at);
  const at = shot.state.anchor + shot.ageEnd;
  const hero = townView(room, at).projects.flatMap(p => p.heroes).find(h => h.id === shot.state.id);
  assert.ok(hero);
  const gear = sessions.find(s => s.id === hero.agent.terminal);
  const tiers = equipmentTiers(gear ?? {}, master[gear?.preset] ?? { weapons: [], accessories: [] });
  const success = recentBattleSuccess(hero.agent, at);
  if (['back', 'reveal', 'party', 'dragon', 'hands', 'hero-hit', 'party-hit', 'dragon-hit', 'return'].includes(shot.kind)) {
    assert.equal(hero.party.length, 3); assert.equal(hero.monster, 'dragon'); assert.equal(success, true);
    assert.equal(hero.agent.postAt, C[26].at); assert.ok(at < C[33].at, 'Battle beyond actual Stop');
  }
  if (shot.kind === 'church') { assert.equal(hero.place, 'church'); assert.ok(at < post.at); }
  if (shot.kind === 'inn') {
    assert.equal(hero.place, 'inn'); assert.ok(moods(hero.agent, at).includes('dozing'));
    assert.ok(shot.ageEnd < doze.inactiveMs, 'Dozing beyond recorded live inactivity');
  }
  if (shot.kind === 'biome') assert.equal(hero.place, 'town');
  const delta = shot.kind === 'hit' && shot.seconds === 0.5 ? 0 : 500;
  const phase = (shot.motion + delta) % 9000;
  const presentation = battlePresentation(tiers, success, Math.floor((shot.motion + delta) / 9000));
  if (['hit', 'hero-hit', 'dragon-hit'].includes(shot.kind)) assert.ok(phase > 500 + presentation.windup && phase < 1000 + presentation.windup);
  if (shot.kind === 'party-hit') assert.ok(phase > 2800 && phase < 3300);
  result.push({ cut: shot.number, kind: shot.kind, origin: shot.state.origin, place: hero.place, monster: hero.monster,
    helpers: hero.agent.helpers.map(h => h.id), wins: hero.agent.wins, level: stats(hero.agent, at).level,
    ageEnd: shot.ageEnd, actualSuccess: success, phase });
}
const before = new Room(), after = new Room();
for (const r of M.slice(0, 69)) if (r.event) before.apply(r.event, r.at);
for (const r of M.slice(0, 70)) if (r.event) after.apply(r.event, r.at);
assert.equal(stats(before.agents.get(M[0].event.agent), M[69].at).level, 2);
assert.equal(stats(after.agents.get(M[0].event.agent), M[69].at).level, 3);
assert.equal(P[7].at - P[6].at, 577); assert.equal(C[33].at - C[26].at, 1183);
writeFileSync(`${root}/source-proof.json`, JSON.stringify({ duration, frames: duration * 30, bpm: 180, compactionMs: post.at - pre.at,
  liveInactivityMs: doze.inactiveMs, compactionContextBefore: pre.event.context, compactionContextAfter: post.event.context,
  note: 'All packets intact; only prefix clock/camera/music edited. No live inn screenshot; actual inactivity supported by continuous recording and computed/captured replay.', scenes: result }, null, 2) + '\n');
console.log('Genuine packets, compact interval, 10m live inactivity, 5 real UI changes, Lv3, three helpers, pi and contact phases verified.');
