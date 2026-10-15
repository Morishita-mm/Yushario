import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { PreviewLink } from "../core/preview";

export class PreviewDatabase {
  constructor(private readonly db: DatabaseSync) {}
  list(quest: string | null, town: string): PreviewLink[] {
    return this.db.prepare("SELECT * FROM quest_previews WHERE quest IS ? AND town=? ORDER BY rowid").all(quest, town) as unknown as PreviewLink[];
  }
  add(quest: string | null, town: string, name: string, url: string): PreviewLink {
    const previous = this.list(quest, town).find((link) => link.url === url);
    if (previous) return previous;
    const link = { id: randomUUID(), quest, town, name, url };
    this.db.prepare("INSERT INTO quest_previews VALUES (?,?,?,?,?)").run(link.id, quest, town, name, url);
    return link;
  }
  remove(id: string): void { this.db.prepare("DELETE FROM quest_previews WHERE id=?").run(id); }
  clearTown(town?: string): void {
    if (town) this.db.prepare("DELETE FROM quest_previews WHERE town=?").run(town);
    else this.db.exec("DELETE FROM quest_previews");
  }
}
