import type { DatabaseSync } from "node:sqlite";
import type { PartyMember } from "../core/party";

export function createPartyTables(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS quest_party (
    session TEXT PRIMARY KEY, quest TEXT NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    hero TEXT, role TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', writer INTEGER NOT NULL DEFAULT 0, joinedAt INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS quest_party_writer ON quest_party(quest) WHERE writer=1;
    CREATE UNIQUE INDEX IF NOT EXISTS quest_party_command ON quest_party(quest) WHERE role='command';
    INSERT OR IGNORE INTO quest_party(session,quest,hero,role,note,writer,joinedAt)
      SELECT b.session,b.quest,b.hero,'implement','',CASE WHEN q.session=b.session THEN 1 ELSE 0 END,q.createdAt
      FROM quest_sessions b JOIN quests q ON q.id=b.quest;
    UPDATE quests SET session=(SELECT p.session FROM quest_party p WHERE p.quest=quests.id AND p.role='implement' ORDER BY p.joinedAt,p.rowid LIMIT 1),
      hero=(SELECT p.hero FROM quest_party p WHERE p.quest=quests.id AND p.role='implement' ORDER BY p.joinedAt,p.rowid LIMIT 1)
      WHERE EXISTS (SELECT 1 FROM quest_party p WHERE p.quest=quests.id);`);
}
export class PartyDatabase {
  constructor(private readonly db: DatabaseSync) {}
  list(quest: string): PartyMember[] {
    return this.db.prepare("SELECT * FROM quest_party WHERE quest=? ORDER BY joinedAt,rowid").all(quest)
      .map((row) => ({ ...row, hero: row.hero ?? undefined, writer: Boolean(row.writer) })) as unknown as PartyMember[];
  }
  member(session: string): PartyMember | undefined {
    const row = this.db.prepare("SELECT * FROM quest_party WHERE session=?").get(session);
    return row ? { ...row, hero: row.hero ?? undefined, writer: Boolean(row.writer) } as unknown as PartyMember : undefined;
  }
  put(member: PartyMember): void {
    this.db.exec("BEGIN");
    try {
      const previous = this.member(member.session);
      if (member.role === "command") this.db.prepare("UPDATE quest_party SET role='research' WHERE quest=? AND role='command' AND session<>?").run(member.quest, member.session);
      if (member.writer) this.db.prepare("UPDATE quest_party SET writer=0 WHERE quest=?").run(member.quest);
      this.db.prepare("INSERT OR REPLACE INTO quest_party VALUES (?,?,?,?,?,?,?)")
        .run(member.session, member.quest, member.hero ?? null, member.role, member.note, Number(member.writer), member.joinedAt);
      this.db.prepare("INSERT OR REPLACE INTO quest_sessions VALUES (?,?,?)").run(member.session, member.quest, member.hero ?? null);
      this.syncLead(member.quest);
      if (previous && previous.quest !== member.quest) this.syncLead(previous.quest);
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  writerSession(quest: string): string | undefined {
    const row = this.db.prepare("SELECT session FROM quest_party WHERE quest=? AND writer=1").get(quest);
    return row ? String(row.session) : undefined;
  }
  syncLead(quest: string): void {
    const lead = this.list(quest).find((member) => member.role === "implement");
    this.db.prepare("UPDATE quests SET session=?,hero=? WHERE id=?").run(lead?.session ?? null, lead?.hero ?? null, quest);
  }
  remove(session: string): void {
    const member = this.member(session);
    this.db.prepare("DELETE FROM quest_party WHERE session=?").run(session);
    this.db.prepare("DELETE FROM quest_sessions WHERE session=?").run(session);
    if (member) this.syncLead(member.quest);
  }
}
