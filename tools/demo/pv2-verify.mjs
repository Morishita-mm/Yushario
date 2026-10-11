// Original prefixes through pure core; verifies the camera never creates an event/result.
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { Room } from '../../src/core/room.ts';
import { stats } from '../../src/core/story.ts';
import { townView } from '../../src/core/town.ts';
import { recentBattleSuccess, battlePresentation, equipmentTiers } from '../../src/core/battle-presentation.ts';
import { shots, sessions } from './pv2-shots.mjs';
const output = process.argv[2] ?? '.art-work/s86';
const rows = (version, name) => readFileSync(`tools/demo/recordings-${version}/${name}.jsonl`, 'utf8').trim().split('\n').map(JSON.parse);
const M = rows('v2', 'main'), C = rows('v3', 'main'), P = rows('v3', 'pi-1');
const source = [...M, ...C, ...P, ...rows('v3', 'pi-2')].filter(r => r.event);
const original = new Set(source.map(r => JSON.stringify({ event: r.event, at: r.at })));
const master = JSON.parse(readFileSync('src/server/equipment.json', 'utf8'));
const result = [];
for (const shot of shots) {
  assert.equal(shot.start * 30 % 15, 0); assert.equal((shot.start + shot.seconds) * 30 % 15, 0);
  if (!shot.state) continue;
  for (const row of [...shot.state.events, ...(shot.state.live ?? [])]) assert.ok(original.has(JSON.stringify({ event: row.event, at: row.at })), 'Edited/new packet');
  const room = new Room();
  for (const { event, at } of shot.state.events) room.apply(event, at);
  for (const { event, at } of shot.state.live ?? []) room.apply(event, at);
  const at = shot.state.anchor + shot.ageEnd;
  const hero = townView(room, at).projects.flatMap(p => p.heroes).find(h => h.id === shot.state.id);
  assert.ok(hero);
  const gear = sessions.find(s => s.id === hero.agent.terminal);
  const tiers = equipmentTiers(gear ?? {}, master[gear?.preset] ?? { weapons: [], accessories: [] });
  const success = recentBattleSuccess(hero.agent, at);
  if (shot.number >= 12 && shot.number <= 20) {
    assert.equal(hero.party.length, 3); assert.equal(hero.monster, 'dragon'); assert.equal(success, true);
    assert.equal(hero.agent.postAt, C[26].at); assert.ok(at < C[33].at, 'Battle held after actual Stop');
  }
  const phase = (shot.motion + 500) % 9000;
  const presentation = battlePresentation(tiers, success, Math.floor((shot.motion + 500) / 9000));
  if ([1, 17, 19].includes(shot.number)) assert.ok(phase > 500 + presentation.windup && phase < 1000 + presentation.windup);
  if (shot.number === 18) assert.ok(phase > 2800 && phase < 3300);
  result.push({ cut: shot.number, source: shot.state.origin, monster: hero.monster, helperIds: hero.agent.helpers.map(h => h.id),
    level: stats(hero.agent, at).level, wins: hero.agent.wins, sourceAgeEnd: shot.ageEnd, msAfterLastMainSuccess: at - hero.agent.postAt,
    actualSuccess: success, equipmentTiers: tiers, contactPhase: [1, 17, 18, 19].includes(shot.number) ? phase : undefined });
}
const before = new Room(), after = new Room();
for (const r of M.slice(0, 69)) if (r.event) before.apply(r.event, r.at);
for (const r of M.slice(0, 70)) if (r.event) after.apply(r.event, r.at);
assert.equal(stats(before.agents.get(M[0].event.agent), M[69].at).level, 2);
assert.equal(stats(after.agents.get(M[0].event.agent), M[69].at).level, 3);
assert.equal(P[7].at - P[6].at, 577); assert.equal(C[33].at - C[26].at, 1183);
const proof = { scope: 'Original packets + pure core + cut/contact clock assertions; completed images separately reviewed.',
  seconds: 30, frames: 900, bpm: 120, levelTransition: 'M#69 Lv2→3', piTestMs: 577,
  partySourceRangeMs: [0, 1182], actualStopAtMs: 1183, scenes: result,
  caveat: 'C#26 is one main success; helper Read successes do not reset postAt. S19 reprises that same success, not a third success.' };
writeFileSync(`${output}/capture-source-check.json`, JSON.stringify(proof, null, 2) + '\n');
console.log('Original packets, Lv3, three helpers, real pi result, stop boundary and all four contact beats verified.');
