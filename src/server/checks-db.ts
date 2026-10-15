import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { CheckCandidate, CheckEvidence, QuestCheck, WorkFingerprint } from "../core/checks";

type CheckCapture = { event: number; quest: string; capture: string };

function decodeEvidence(row: Record<string, unknown>): CheckEvidence {
  return { command: String(row.command), passed: Number(row.passed) < 0 ? undefined : Boolean(row.passed), checks: JSON.parse(String(row.matches)),
    at: Number(row.at), session: String(row.session), hero: row.hero ? String(row.hero) : undefined, base: row.base ? String(row.base) : undefined,
    fingerprint: row.fingerprint ? JSON.parse(String(row.fingerprint)) : undefined };
}
export class CheckDatabase {
  readonly fingerprints = new Map<string, WorkFingerprint | undefined>();
  constructor(private readonly db: DatabaseSync) {}
  conditions(quest: string): QuestCheck[] {
    return this.db.prepare("SELECT id,name,command FROM quest_checks WHERE quest=? ORDER BY rowid").all(quest) as unknown as QuestCheck[];
  }
  // Read one latest row per current condition, never materialize the evidence history.
  private latest(quest?: string): { quest: string; check: QuestCheck }[] {
    return this.db.prepare(`SELECT c.quest,c.id,c.name,c.command AS shape,e.event,e.command,e.passed,e.matches,e.fingerprint,e.base,q.at,q.session,q.hero
      FROM quest_checks c LEFT JOIN quest_check_evidence e ON e.event=c.latestEvent
      LEFT JOIN quest_events q ON q.id=e.event ${quest === undefined ? "" : "WHERE c.quest=?"} ORDER BY c.rowid`)
      .all(...(quest === undefined ? [] : [quest])).map((row) => ({ quest: String(row.quest),
        check: { id: String(row.id), name: String(row.name), command: String(row.shape), evidence: row.event === null ? undefined : decodeEvidence(row) } }));
  }
  list(quest: string): QuestCheck[] { return this.latest(quest).map((row) => row.check); }
  listAll(): Map<string, QuestCheck[]> {
    const quests = new Map<string, QuestCheck[]>();
    for (const { quest, check } of this.latest()) {
      const checks = quests.get(quest) ?? []; checks.push(check); quests.set(quest, checks);
    }
    return quests;
  }
  add(quest: string, input: CheckCandidate): void {
    this.db.prepare("INSERT INTO quest_checks(id,quest,name,command) VALUES (?,?,?,?)").run(randomUUID(), quest, input.name.trim(), input.command.trim());
  }
  remove(quest: string, id: string): void { this.db.prepare("DELETE FROM quest_checks WHERE quest=? AND id=?").run(quest, id); }
  evidence(quest: string): CheckEvidence[] {
    return this.db.prepare(`SELECT e.command,e.passed,e.matches,e.fingerprint,e.base,q.at,q.session,q.hero FROM quest_check_evidence e
      JOIN quest_events q ON q.id=e.event WHERE q.quest=? ORDER BY q.at,q.id`).all(quest).map(decodeEvidence);
  }
  record(quest: string, evidence: CheckEvidence): CheckCapture {
    this.db.exec("SAVEPOINT check_record");
    try {
      const event = this.db.prepare("INSERT INTO quest_events(quest,kind,at,title,session,hero) VALUES (?,'check',?,?,?,?)")
        .run(quest, evidence.at, evidence.command, evidence.session, evidence.hero ?? null);
      const id = Number(event.lastInsertRowid), capture = randomUUID();
      this.db.prepare("INSERT INTO quest_check_evidence(event,command,passed,matches,base,capture) VALUES (?,?,?,?,?,?)")
        .run(id, evidence.command, evidence.passed === undefined ? -1 : evidence.passed ? 1 : 0, JSON.stringify(evidence.checks), evidence.base ?? null, capture);
      this.db.prepare(`UPDATE quest_checks SET latestEvent=? WHERE quest=? AND id IN (SELECT value FROM json_each(?))
        AND (latestEvent IS NULL OR (SELECT at FROM quest_events WHERE id=latestEvent)<=?)`)
        .run(id, quest, JSON.stringify(evidence.checks), evidence.at);
      this.db.prepare("UPDATE quests SET updatedAt=MAX(updatedAt,?) WHERE id=?").run(evidence.at, quest);
      this.db.exec("RELEASE check_record");
      return { event: id, quest, capture };
    } catch (error) {
      this.db.exec("ROLLBACK TO check_record; RELEASE check_record"); throw error;
    }
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
