import type { DatabaseSync } from "node:sqlite";
import { certainCheckCommand } from "../core/checks";

// Versions 1 and 2 are unchanged. Version 3 also adopts tables created outside
// user_version by stages 18–19.5, so all later schema changes have one owner.
export const migrations = [(db: DatabaseSync) => db.exec(`
  CREATE TABLE quests (id TEXT PRIMARY KEY, town TEXT NOT NULL, title TEXT NOT NULL, purpose TEXT NOT NULL,
    state TEXT NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, session TEXT, hero TEXT);
  CREATE TABLE quest_events (id INTEGER PRIMARY KEY, quest TEXT NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, at INTEGER NOT NULL, title TEXT NOT NULL, session TEXT, hero TEXT, report TEXT, text TEXT);
  CREATE TABLE quest_sessions (session TEXT PRIMARY KEY, quest TEXT NOT NULL REFERENCES quests(id) ON DELETE CASCADE, hero TEXT);
  CREATE INDEX quest_events_quest ON quest_events(quest, at);
`), (db: DatabaseSync) => db.exec(`ALTER TABLE quests ADD COLUMN worktreePath TEXT; ALTER TABLE quests ADD COLUMN worktreeBranch TEXT;`), migrateAdditionalTables, migrateCheckReads];

function migrateCheckReads(db: DatabaseSync): void {
  db.exec(`CREATE INDEX quest_report_hero ON quest_events(hero,at) WHERE kind='report';
    CREATE INDEX quest_report_session ON quest_events(session,at) WHERE kind='report';
    ALTER TABLE quest_checks ADD COLUMN latestEvent INTEGER REFERENCES quest_events(id) ON DELETE SET NULL;
    UPDATE quest_checks SET latestEvent=(SELECT h.id FROM quest_events h JOIN quest_check_evidence e ON e.event=h.id
      WHERE h.quest=quest_checks.quest AND EXISTS (SELECT 1 FROM json_each(e.matches) m WHERE m.value=quest_checks.id)
      ORDER BY h.at DESC,h.id DESC LIMIT 1);`);
  const unknown = db.prepare("UPDATE quest_check_evidence SET passed=-1 WHERE event=?");
  // Old evidence kept only 200 characters: a cut command cannot prove safety.
  for (const row of db.prepare("SELECT event,command FROM quest_check_evidence").iterate()) {
    const command = String(row.command);
    if (command.length >= 200 || !certainCheckCommand(command)) unknown.run(row.event);
  }
}

function migrateAdditionalTables(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS quest_party (
    session TEXT PRIMARY KEY, quest TEXT NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    hero TEXT, role TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', writer INTEGER NOT NULL DEFAULT 0, joinedAt INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS quest_party_writer ON quest_party(quest) WHERE writer=1;
    CREATE UNIQUE INDEX IF NOT EXISTS quest_party_command ON quest_party(quest) WHERE role='command';
    CREATE TABLE IF NOT EXISTS quest_checks (
    id TEXT PRIMARY KEY, quest TEXT NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    name TEXT NOT NULL, command TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS quest_check_evidence (
    event INTEGER PRIMARY KEY REFERENCES quest_events(id) ON DELETE CASCADE,
    command TEXT NOT NULL, passed INTEGER NOT NULL, matches TEXT NOT NULL, fingerprint TEXT, base TEXT, capture TEXT);
    CREATE INDEX IF NOT EXISTS quest_checks_quest ON quest_checks(quest);
    CREATE TABLE IF NOT EXISTS quest_previews (
    id TEXT PRIMARY KEY, quest TEXT REFERENCES quests(id) ON DELETE CASCADE,
    town TEXT NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS quest_previews_scope ON quest_previews(town,quest);`);
  const columns = db.prepare("PRAGMA table_info(quest_check_evidence)").all();
  for (const column of ["base", "capture"]) if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE quest_check_evidence ADD COLUMN ${column} TEXT`);
  }
  db.exec(`INSERT OR IGNORE INTO quest_party(session,quest,hero,role,note,writer,joinedAt)
      SELECT b.session,b.quest,b.hero,'implement','',CASE WHEN q.session=b.session THEN 1 ELSE 0 END,q.createdAt
      FROM quest_sessions b JOIN quests q ON q.id=b.quest;
    UPDATE quests SET session=(SELECT p.session FROM quest_party p WHERE p.quest=quests.id AND p.role='implement' ORDER BY p.joinedAt,p.rowid LIMIT 1),
      hero=(SELECT p.hero FROM quest_party p WHERE p.quest=quests.id AND p.role='implement' ORDER BY p.joinedAt,p.rowid LIMIT 1)
      WHERE EXISTS (SELECT 1 FROM quest_party p WHERE p.quest=quests.id);`);
}
