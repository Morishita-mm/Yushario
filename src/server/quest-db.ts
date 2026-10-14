import { DatabaseSync } from "node:sqlite";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { dataDirectory } from "./startup";
import { CheckDatabase } from "./checks-db";
import { createPreviewTables, PreviewDatabase } from "./preview-db";
import { createPartyTables, PartyDatabase } from "./party-db";
import type { Quest, QuestBinding, QuestEvent, QuestDetail, QuestReportLink } from "../core/quests";

const migrations = [(db: DatabaseSync) => db.exec(`
  CREATE TABLE quests (id TEXT PRIMARY KEY, town TEXT NOT NULL, title TEXT NOT NULL, purpose TEXT NOT NULL,
    state TEXT NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, session TEXT, hero TEXT);
  CREATE TABLE quest_events (id INTEGER PRIMARY KEY, quest TEXT NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, at INTEGER NOT NULL, title TEXT NOT NULL, session TEXT, hero TEXT, report TEXT, text TEXT);
  CREATE TABLE quest_sessions (session TEXT PRIMARY KEY, quest TEXT NOT NULL REFERENCES quests(id) ON DELETE CASCADE, hero TEXT);
  CREATE INDEX quest_events_quest ON quest_events(quest, at);
`), (db: DatabaseSync) => db.exec(`ALTER TABLE quests ADD COLUMN worktreePath TEXT; ALTER TABLE quests ADD COLUMN worktreeBranch TEXT;`)];

export class QuestDatabase {
  private readonly db: DatabaseSync;
  readonly party: PartyDatabase;
  readonly checks: CheckDatabase;
  readonly previews: PreviewDatabase;
  constructor() {
    const path = join(dataDirectory, "yushario.db");
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON;");
    const version = Number(this.db.prepare("PRAGMA user_version").get()!.user_version);
    if (version > migrations.length) throw new Error("Quest database is from a newer Yushario");
    for (let i = version; i < migrations.length; i++) {
      this.db.exec("BEGIN");
      try { migrations[i](this.db); this.db.exec(`PRAGMA user_version=${i + 1}; COMMIT`); }
      catch (error) { this.db.exec("ROLLBACK"); throw error; }
    }
    createPartyTables(this.db); this.party = new PartyDatabase(this.db);
    this.checks = new CheckDatabase(this.db);
    createPreviewTables(this.db); this.previews = new PreviewDatabase(this.db);
  }
  list(): Quest[] { return (this.db.prepare("SELECT * FROM quests ORDER BY updatedAt DESC").all() as unknown as Quest[])
    .map((quest) => ({ ...quest, checks: this.checks.list(quest.id), fingerprint: this.checks.fingerprints.get(quest.id) })); }
  get(id: string): QuestDetail | undefined {
    const quest = this.db.prepare("SELECT * FROM quests WHERE id=?").get(id) as unknown as Quest | undefined;
    if (!quest) return;
    const events = this.db.prepare("SELECT * FROM quest_events WHERE quest=? ORDER BY at DESC, id DESC").all(id)
      .map((row) => ({ ...row, report: row.report ? JSON.parse(String(row.report)) : undefined, text: row.text ?? undefined })) as unknown as QuestEvent[];
    return { ...quest, events: events.map((event) => event.kind === "check" ? { ...event, evidence: this.checks.event(event.id) } : event),
      checks: this.checks.list(id), fingerprint: this.checks.fingerprints.get(id) };
  }
  save(quest: Quest): void {
    const { id, town, title, purpose, state, createdAt, updatedAt, session, hero, worktreePath, worktreeBranch } = quest;
    this.db.prepare("INSERT OR REPLACE INTO quests VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .run(id, town, title, purpose, state, createdAt, updatedAt, session ?? null, hero ?? null, worktreePath ?? null, worktreeBranch ?? null);
  }
  // UPDATE rather than REPLACE: replacing the parent would cascade-delete its history.
  update(quest: Quest): void {
    this.db.prepare("UPDATE quests SET title=?,purpose=?,state=?,updatedAt=?,session=?,hero=?,worktreePath=?,worktreeBranch=? WHERE id=?")
      .run(quest.title, quest.purpose, quest.state, quest.updatedAt, quest.session ?? null, quest.hero ?? null, quest.worktreePath ?? null, quest.worktreeBranch ?? null, quest.id);
  }
  add(event: Omit<QuestEvent, "id">): void {
    this.db.prepare("INSERT INTO quest_events(quest,kind,at,title,session,hero,report,text) VALUES (?,?,?,?,?,?,?,?)")
      .run(event.quest, event.kind, event.at, event.title, event.session ?? null, event.hero ?? null,
        event.report ? JSON.stringify(event.report) : null, event.text ?? null);
  }
  reports(): QuestReportLink[] {
    return this.db.prepare("SELECT e.hero,e.at,q.title FROM quest_events e JOIN quests q ON q.id=e.quest WHERE e.kind='report' AND e.hero IS NOT NULL").all() as unknown as QuestReportLink[];
  }
  correctReport(session: string, at: number, report: QuestEvent["report"], title: string): void {
    this.db.prepare("UPDATE quest_events SET report=?,title=? WHERE kind='report' AND session=? AND at=?")
      .run(JSON.stringify(report), title, session, at);
  }
  bindings(): QuestBinding[] { return this.db.prepare("SELECT * FROM quest_sessions").all() as unknown as QuestBinding[]; }
  bind(binding: QuestBinding): void {
    this.db.prepare("INSERT OR REPLACE INTO quest_sessions VALUES (?,?,?)").run(binding.session, binding.quest, binding.hero ?? null);
  }
  unbind(session: string): void { this.db.prepare("DELETE FROM quest_sessions WHERE session=?").run(session); }
  delete(id: string): void { this.db.prepare("DELETE FROM quests WHERE id=?").run(id); }
  clear(town?: string): void {
    if (town) this.db.prepare("DELETE FROM quests WHERE town=?").run(town);
    else this.db.exec("DELETE FROM quests");
  }
  close(): void { this.db.close(); }
}
