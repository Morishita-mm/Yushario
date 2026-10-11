// Verify genuine recordings using the same pure core as the app. Run with existing tsx.
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { Room } from '../../src/core/room.ts';
import { stats } from '../../src/core/story.ts';
import { main, party, pi, townPi } from './pv-shots.mjs';
function verify(rows) {
  const room = new Room(), levels = [], helpers = [];
  let last, previous = 1, maxHelpers = 0;
  for (const [index, row] of rows.entries()) {
    if (!row.event || row.event.hook === 'SessionEnd') continue;
    const agent = room.apply(row.event, row.at);
    const value = stats(agent, row.at).level;
    if (value > previous) levels.push({ index, hook: row.event.hook, tool: row.event.tool, level: value, wins: agent.wins });
    previous = value; maxHelpers = Math.max(maxHelpers, agent.helpers.length);
    if (agent.helpers.length === 3) helpers.push(index);
    last = { id: agent.id, source: row.event.source, project: agent.project, wins: agent.wins, level: value,
      report: agent.talk.findLast(t => t.report?.kind === 'chest')?.report };
  }
  return { ...last, levels, maxHelpers, threeHelperRange: helpers.length ? [helpers[0], helpers.at(-1)] : undefined };
}
const old = verify(main), fresh = verify(party), test = verify(pi), town = verify(townPi);
assert.equal(fresh.maxHelpers, 3);
assert.equal(party.filter(r => r.event?.hook === 'SubagentStart').length, 3);
assert.equal(fresh.report.files.length, 6); assert.equal(fresh.report.tests.passed, 1); assert.equal(fresh.report.tests.failed, 0);
assert.equal(party.filter(r => r.type === 'permission').length, 7);
assert.equal(party.filter(r => r.type === 'permission-resolved').length, 7);
assert.equal(old.levels.find(l => l.level === 3).index, 69);
assert.equal(old.report.files.length, 6); assert.equal(old.report.tests.passed, 1);
assert.equal(pi[6].event.source, 'pi'); assert.equal(pi[6].event.target, 'npm test');
assert.equal(pi[7].event.hook, 'PostToolUse'); assert.equal(pi[7].event.state, 'working');
assert.match(pi[8].event.text, /6件すべて成功/);
assert.equal(fresh.project, test.project); assert.equal(test.project, town.project);
for (const name of ['main', 'pi-1', 'pi-2']) {
  const pty = JSON.parse(readFileSync(`tools/demo/recordings-v3/${name}-pty.jsonl`, 'utf8')).data;
  assert.doesNotMatch(pty, /\/Users\/|\/home\/|agent-quest-demo\.[A-Za-z0-9]/);
  assert.doesNotMatch(pty.replaceAll('demo@example.invalid', ''), /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
}
const proof = { old, fresh, pi: test, townPi: town, manualPermissions: 7,
  note: 'All core results from original ordered events/receipt times, including helper tool wins. No source events invented or relabelled. Final video uses old M for S4/S6/S7, disclosed as real takes.' };
writeFileSync('.art-work/s85/recording-proof.json', JSON.stringify(proof, null, 2) + '\n');
console.log(`Verified: 3 concurrent helpers; fresh Lv${fresh.level}; old M Lv3 at #69; pi real npm test; seven manual permissions; redaction.`);
