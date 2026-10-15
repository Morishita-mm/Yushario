import type { DatabaseSync } from "node:sqlite";
import type { PartyMember } from "../core/party";

export class PartyDatabase {
  constructor(private readonly db: DatabaseSync) {}
  list(quest: string): PartyMember[] {
    return this.db.prepare("SELECT * FROM quest_party WHERE quest=? ORDER BY joinedAt,rowid").all(quest)
      .map((row) => ({ ...row, hero: row.hero ?? undefined, writer: Boolean(row.writer) })) as unknown as PartyMember[];
  }
  all(): PartyMember[] {
    return this.db.prepare("SELECT * FROM quest_party ORDER BY joinedAt,rowid").all()
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
    // The quest's owner is the hero who writes; an implement role is only the fallback.
    const members = this.list(quest), lead = members.find((member) => member.writer) ?? members.find((member) => member.role === "implement");
    this.db.prepare("UPDATE quests SET session=?,hero=? WHERE id=?").run(lead?.session ?? null, lead?.hero ?? null, quest);
  }
  remove(session: string): void {
    const member = this.member(session);
    this.db.prepare("DELETE FROM quest_party WHERE session=?").run(session);
    this.db.prepare("DELETE FROM quest_sessions WHERE session=?").run(session);
    if (member) this.syncLead(member.quest);
  }
}
