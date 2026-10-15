import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { latestCheckEvidence, type CheckCandidate, type CheckEvidence, type QuestCheck, type WorkFingerprint } from "../core/checks";

type CheckCapture = { event: number; quest: string; capture: string };

export function createCheckTables(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS quest_checks (
    id TEXT PRIMARY KEY, quest TEXT NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    name TEXT NOT NULL, command TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS quest_check_evidence (
    event INTEGER PRIMARY KEY REFERENCES quest_events(id) ON DELETE CASCADE,
    command TEXT NOT NULL, passed INTEGER NOT NULL, matches TEXT NOT NULL, fingerprint TEXT, base TEXT, capture TEXT);
    CREATE INDEX IF NOT EXISTS quest_checks_quest ON quest_checks(quest);`);
  // These tables predate the numbered quest migrations. Upgrade existing databases in place.
  const columns = db.prepare("PRAGMA table_info(quest_check_evidence)").all();
  for (const column of ["base", "capture"]) if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE quest_check_evidence ADD COLUMN ${column} TEXT`);
  }
}
function decodeEvidence(row: Record<string, unknown>): CheckEvidence {
  return { command: String(row.command), passed: Boolean(row.passed), checks: JSON.parse(String(row.matches)),
    at: Number(row.at), session: String(row.session), hero: row.hero ? String(row.hero) : undefined, base: row.base ? String(row.base) : undefined,
    fingerprint: row.fingerprint ? JSON.parse(String(row.fingerprint)) : undefined };
}
export class CheckDatabase {
  readonly fingerprints = new Map<string, WorkFingerprint | undefined>();
  constructor(private readonly db: DatabaseSync) { createCheckTables(db); }
  list(quest: string): QuestCheck[] {
    const evidence = this.evidence(quest);
    return (this.db.prepare("SELECT id,name,command FROM quest_checks WHERE quest=? ORDER BY rowid").all(quest) as unknown as QuestCheck[])
      .map((check) => ({ ...check, evidence: latestCheckEvidence(check.id, evidence) }));
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
