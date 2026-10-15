import { DatabaseSync } from "node:sqlite";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { dataDirectory } from "./startup";
import { CheckDatabase } from "./checks-db";
import { PreviewDatabase } from "./preview-db";
import { PartyDatabase } from "./party-db";
import { migrations } from "./quest-migrations";
import type { Quest, QuestBinding, QuestEvent, QuestDetail, QuestReportLink } from "../core/quests";

export class QuestDatabase {
  private readonly db: DatabaseSync;
  readonly party: PartyDatabase;
  readonly checks: CheckDatabase;
  readonly previews: PreviewDatabase;
  constructor() {
    const path = join(dataDirectory, "yushario.db");
    let opened: DatabaseSync | undefined;
    try {
      this.db = opened = new DatabaseSync(path);
      chmodSync(path, 0o600);
      this.db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON;");
      const version = Number(this.db.prepare("PRAGMA user_version").get()!.user_version);
      if (version > migrations.length) throw new Error("Quest database is from a newer Yushario");
      for (let i = version; i < migrations.length; i++) {
        this.db.exec("BEGIN");
        try { migrations[i](this.db); this.db.exec(`PRAGMA user_version=${i + 1}; COMMIT`); }
        catch (error) { this.db.exec("ROLLBACK"); throw error; }
      }
      this.party = new PartyDatabase(this.db);
      this.checks = new CheckDatabase(this.db);
      this.previews = new PreviewDatabase(this.db);
    } catch (cause) {
      try { opened?.close(); } catch { /* Keep the original startup error. */ }
      const error = new Error(`Cannot open or read quest database: ${path}\nCheck permissions, damage, or a newer database version. Keep the file; set it aside without deleting it, then try a different AGENT_CHARACTER_HOME.\nクエストの DB を 開けないか 読めません: ${path}\n権限・破損・新しい版の DB を 確かめてください。消さずに退避して、別の AGENT_CHARACTER_HOME で 切り分けてください。`, { cause });
      error.name = "QuestDatabaseError";
      throw error;
    }
  }
  list(): Quest[] {
    const checks = this.checks.listAll();
    const writers = new Map(this.db.prepare("SELECT quest,session FROM quest_party WHERE writer=1").all().map((row) => [String(row.quest), String(row.session)]));
    return (this.db.prepare("SELECT * FROM quests ORDER BY updatedAt DESC").all() as unknown as Quest[])
      .map((quest) => ({ ...quest, writerSession: writers.get(quest.id), checks: checks.get(quest.id) ?? [], fingerprint: this.checks.fingerprints.get(quest.id) }));
  }
  summary(id: string): Quest | undefined {
    const quest = this.db.prepare("SELECT * FROM quests WHERE id=?").get(id) as unknown as Quest | undefined;
    return quest && { ...quest, writerSession: this.party.writerSession(id), checks: this.checks.list(id), fingerprint: this.checks.fingerprints.get(id) };
  }
  get(id: string): QuestDetail | undefined {
    const quest = this.summary(id);
    if (!quest) return;
    const events = this.db.prepare("SELECT * FROM quest_events WHERE quest=? ORDER BY at DESC, id DESC").all(id)
      .map((row) => {
        const saved = row.report ? JSON.parse(String(row.report)) : undefined;
        const { result, ...report } = saved ?? {};
        return { ...row, report: report.kind ? report : undefined, result, text: row.text ?? undefined };
      }) as unknown as QuestEvent[];
    return { ...quest, events: events.map((event) => event.kind === "check" ? { ...event, evidence: this.checks.event(event.id) } : event) };
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
  add(event: Omit<QuestEvent, "id">): number {
    return Number(this.db.prepare("INSERT INTO quest_events(quest,kind,at,title,session,hero,report,text) VALUES (?,?,?,?,?,?,?,?)")
      .run(event.quest, event.kind, event.at, event.title, event.session ?? null, event.hero ?? null,
        event.report || event.result ? JSON.stringify({ ...event.report, result: event.result }) : null, event.text ?? null).lastInsertRowid);
  }
  attachResult(id: number, quest: string, session: string, at: number, result: NonNullable<QuestEvent["result"]>): boolean {
    return this.db.prepare("UPDATE quest_events SET report=json_set(report,'$.result',json(?)) WHERE id=? AND quest=? AND kind='report' AND session=? AND at=? AND json_extract(report,'$.result.cwd')=?")
      .run(JSON.stringify(result), id, quest, session, at, result.cwd).changes > 0;
  }
  reportsAfter(session: string, at: number): QuestEvent[] {
    return this.db.prepare("SELECT * FROM quest_events WHERE kind='report' AND session=? AND at>=? AND json_extract(report,'$.startedAt')<=?").all(session, at, at)
      .map((row) => ({ ...row, report: JSON.parse(String(row.report)) })) as unknown as QuestEvent[];
  }
  reports(): QuestReportLink[] {
    return this.db.prepare("SELECT e.hero,e.at,q.title FROM quest_events e JOIN quests q ON q.id=e.quest WHERE e.kind='report' AND e.hero IS NOT NULL").all() as unknown as QuestReportLink[];
  }
  correctReport(session: string, at: number, report: QuestEvent["report"], title: string): void {
    this.db.prepare("UPDATE quest_events SET report=json_set(json(?),'$.result',json_extract(report,'$.result')),title=? WHERE kind='report' AND session=? AND at=?")
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
