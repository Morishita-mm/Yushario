import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { latestCheckEvidence, type CheckCandidate, type CheckEvidence, type QuestCheck, type WorkFingerprint } from "../core/checks";

type CheckCapture = { event: number; quest: string; capture: string };

function decodeEvidence(row: Record<string, unknown>): CheckEvidence {
  return { command: String(row.command), passed: Boolean(row.passed), checks: JSON.parse(String(row.matches)),
    at: Number(row.at), session: String(row.session), hero: row.hero ? String(row.hero) : undefined, base: row.base ? String(row.base) : undefined,
    fingerprint: row.fingerprint ? JSON.parse(String(row.fingerprint)) : undefined };
}
export class CheckDatabase {
  readonly fingerprints = new Map<string, WorkFingerprint | undefined>();
  constructor(private readonly db: DatabaseSync) {}
  list(quest: string): QuestCheck[] {
    const evidence = this.evidence(quest);
    return (this.db.prepare("SELECT id,name,command FROM quest_checks WHERE quest=? ORDER BY rowid").all(quest) as unknown as QuestCheck[])
      .map((check) => ({ ...check, evidence: latestCheckEvidence(check.id, evidence) }));
  }
  listAll(): Map<string, QuestCheck[]> {
    const latest = new Map<string, CheckEvidence>();
    const rows = this.db.prepare(`SELECT q.quest,e.command,e.passed,e.matches,e.fingerprint,e.base,q.at,q.session,q.hero FROM quest_check_evidence e
      JOIN quest_events q ON q.id=e.event WHERE EXISTS (SELECT 1 FROM quest_checks c WHERE c.quest=q.quest) ORDER BY q.at,q.id`).all();
    for (const row of rows) {
      const evidence = decodeEvidence(row);
      for (const id of evidence.checks) latest.set(`${row.quest}:${id}`, evidence);
    }
    const quests = new Map<string, QuestCheck[]>();
    for (const row of this.db.prepare("SELECT quest,id,name,command FROM quest_checks ORDER BY rowid").all()) {
      const quest = String(row.quest), checks = quests.get(quest) ?? [];
      checks.push({ id: String(row.id), name: String(row.name), command: String(row.command), evidence: latest.get(`${quest}:${row.id}`) });
      quests.set(quest, checks);
    }
    return quests;
  }
  add(quest: string, input: CheckCandidate): void {
    this.db.prepare("INSERT INTO quest_checks VALUES (?,?,?,?)").run(randomUUID(), quest, input.name.trim(), input.command.trim());
  }
  remove(quest: string, id: string): void { this.db.prepare("DELETE FROM quest_checks WHERE quest=? AND id=?").run(quest, id); }
  evidence(quest: string): CheckEvidence[] {
    return this.db.prepare(`SELECT e.command,e.passed,e.matches,e.fingerprint,e.base,q.at,q.session,q.hero FROM quest_check_evidence e
      JOIN quest_events q ON q.id=e.event WHERE q.quest=? ORDER BY q.at,q.id`).all(quest).map(decodeEvidence);
  }
  record(quest: string, evidence: CheckEvidence): CheckCapture {
    const event = this.db.prepare("INSERT INTO quest_events(quest,kind,at,title,session,hero) VALUES (?,'check',?,?,?,?)")
      .run(quest, evidence.at, evidence.command, evidence.session, evidence.hero ?? null);
    const id = Number(event.lastInsertRowid), capture = randomUUID();
    this.db.prepare("INSERT INTO quest_check_evidence(event,command,passed,matches,base,capture) VALUES (?,?,?,?,?,?)")
      .run(id, evidence.command, evidence.passed ? 1 : 0, JSON.stringify(evidence.checks), evidence.base ?? null, capture);
    this.db.prepare("UPDATE quests SET updatedAt=MAX(updatedAt,?) WHERE id=?").run(evidence.at, quest);
    return { event: id, quest, capture };
  }
  attach(key: CheckCapture, fingerprint: WorkFingerprint | undefined): void {
    this.db.prepare(`UPDATE quest_check_evidence SET fingerprint=? WHERE event=? AND capture=? AND fingerprint IS NULL
      AND EXISTS (SELECT 1 FROM quest_events q WHERE q.id=event AND q.quest=?)`)
      .run(fingerprint ? JSON.stringify(fingerprint) : null, key.event, key.capture, key.quest);
  }
  event(id: number): CheckEvidence | undefined {
    const row = this.db.prepare(`SELECT e.command,e.passed,e.matches,e.fingerprint,e.base,q.at,q.session,q.hero FROM quest_check_evidence e
      JOIN quest_events q ON q.id=e.event WHERE e.event=?`).get(id);
    return row ? decodeEvidence(row) : undefined;
  }
}
