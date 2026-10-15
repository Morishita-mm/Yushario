import { setLanguage, tr } from "./language";
import type { IncomingMessage, ServerResponse } from "node:http";
import { activateTown, archiveTowns, registerTown, townKey, validSettings, type TownRecord, type TownTheme } from "../core/town-ledger";
import { namedHero, normalizeHeroName, type HeroNames } from "../core/names";
import { isClaudeSessionId } from "../core/roster";
import { readNames, readSettings, readTowns, validTheme, writeNames, writeSettings, writeTowns } from "./town-data";
import { readJsonBody, SETTINGS_BODY_LIMIT } from "./http-body";

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" })
    .end(JSON.stringify(value));
}

// Town and display preferences only: no session, report, or conversation history.
export class TownLedger {
  towns = readTowns();
  names = readNames();
  private settings = { saveConversation: false, ...readSettings() };
  private activityDirty = false;

  constructor(private readonly changed: (towns: TownRecord[]) => void,
    private readonly namesChanged: (names: HeroNames) => void) { setLanguage(this.settings.language); }

  private save(towns: TownRecord[]): void {
    if (towns === this.towns) return;
    writeTowns(towns);
    this.towns = towns;
    this.activityDirty = false;
    this.changed(towns);
  }

  get saveConversation(): boolean { return this.settings.saveConversation === true; }

  register(name: string, path: string, now: number, key?: string, parent?: string): void {
    this.save(registerTown(this.towns, name, path, now, key, parent));
  }

  observe(key: string, now: number): void {
    const town = this.towns.find((town) => townKey(town) === key);
    if (!town) return;
    if (town.archivedAt !== undefined) {
      this.save(activateTown(this.towns, key, now));
    } else if (now > town.lastActiveAt) {
      town.lastActiveAt = now;
      this.activityDirty = true;
    }
  }

  // Activity timestamps do not change the visible town list; save together without broadcasting.
  flushActivity(): void {
    if (!this.activityDirty) return;
    writeTowns(this.towns);
    this.activityDirty = false;
  }

  archive(activeKeys: ReadonlySet<string>, now: number): void {
    this.save(archiveTowns(this.towns, activeKeys, this.settings.archiveAfterDays, now));
  }

  async handleRequest(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    // Town JSON keeps name for display and key for identity; URLs carry the key.
    if (url.pathname === "/api/towns" && request.method === "GET") {
      json(response, 200, this.towns);
      return;
    }
    if (url.pathname === "/api/settings" && request.method === "GET") {
      json(response, 200, { ...this.settings, startupCwd: process.cwd() });
      return;
    }
    if (url.pathname === "/api/names" && request.method === "GET") {
      json(response, 200, this.names);
      return;
    }
    const patch = url.pathname.startsWith("/api/towns/") && request.method === "PATCH";
    const settings = url.pathname === "/api/settings" && request.method === "PUT";
    const rename = url.pathname.startsWith("/api/names/") && request.method === "PUT";
    if (!patch && !settings && !rename) {
      const allow = url.pathname === "/api/names" ? "GET"
        : url.pathname.startsWith("/api/names/") ? "PUT"
        : url.pathname === "/api/settings" ? "GET, PUT" : "GET, PATCH";
      response.writeHead(405, { Allow: allow }).end();
      return;
    }
    let name: string | undefined;
    if (rename) {
      try { name = decodeURIComponent(url.pathname.slice("/api/names/".length)); }
      catch { json(response, 400, { error: tr("勇者の ID が正しくありません", "Invalid hero ID") }); return; }
      if (!isClaudeSessionId(name)) { json(response, 400, { error: tr("勇者の ID が正しくありません", "Invalid hero ID") }); return; }
    }
    if (patch) {
      try { name = decodeURIComponent(url.pathname.slice("/api/towns/".length)); }
      catch { json(response, 400, { error: tr("町の名前が正しくありません", "Invalid town name") }); return; }
      if (!this.towns.some((town) => townKey(town) === name)) {
        json(response, 404, { error: tr("その町が見つかりません", "Town not found") });
        return;
      }
    }
    const body = await readJsonBody(request, response, SETTINGS_BODY_LIMIT);
    if (!body.ok) return;
    const input = body.value;
    try {
      if (rename) {
        const value = input && typeof input === "object" && !Array.isArray(input)
          ? (input as Record<string, unknown>).name : undefined;
        const chosen = normalizeHeroName(value);
        if (chosen === undefined) {
          json(response, 400, { error: tr("名前は 1〜24 文字で入力してください。空にすると元の名前に戻ります", "Use 1–24 characters, or leave blank for the default name") });
          return;
        }
        const id = name!;
        if (chosen !== (namedHero(this.names, id) ?? "")) {
          const updated = { ...this.names };
          if (chosen) updated[id] = chosen;
          else delete updated[id];
          writeNames(updated);
          this.names = updated;
          this.namesChanged(updated);
        }
        json(response, 200, this.names);
      } else if (settings) {
        if (!validSettings(input)) {
          json(response, 400, { error: tr("町をしまうまでの日数は 0〜365 の整数、おとは all・follow・off で指定してください", "Use 0–365 whole days, sound all/follow/off, and language auto/ja/en") });
          return;
        }
        const next = { ...input, saveConversation: input.saveConversation ?? this.settings.saveConversation };
        if (next.archiveAfterDays !== this.settings.archiveAfterDays || next.sound !== this.settings.sound || next.language !== this.settings.language || next.saveConversation !== this.settings.saveConversation) {
          writeSettings(next);
          this.settings = next;
          setLanguage(next.language);
          this.changed(this.towns);
        }
        json(response, 200, this.settings);
      } else {
        if (!validPatch(input)) {
          json(response, 400, { error: tr("町のすがた・ピンどめ・しまった町を戻す設定が正しくありません", "Invalid town look, pin, or restore setting") });
          return;
        }
        const town = this.towns.find((town) => townKey(town) === name)!;
        if ((input.theme !== undefined && input.theme !== town.theme)
          || (input.pinned !== undefined && input.pinned !== town.pinned)
          || (input.archived === false && town.archivedAt !== undefined)) {
          const updated = { ...town };
          if (input.theme !== undefined) updated.theme = input.theme;
          if (input.pinned !== undefined) updated.pinned = input.pinned;
          if (input.archived === false) delete updated.archivedAt;
          this.save(this.towns.map((item) => item === town ? updated : item));
        }
        json(response, 200, this.towns.find((town) => townKey(town) === name));
      }
    } catch (error) {
      console.error("Town save failed:", error instanceof Error ? error.message : String(error));
      json(response, 500, { error: tr("町の記録を保存できませんでした。データフォルダの権限を確認してください", "Could not save towns. Check data-folder permissions") });
    }
  }
}

type TownPatch = { theme?: TownTheme; pinned?: boolean; archived?: false };
function validPatch(input: unknown): input is TownPatch {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>;
  return Object.keys(value).every((key) => ["theme", "pinned", "archived"].includes(key))
    && (value.theme === undefined || validTheme(value.theme))
    && (value.pinned === undefined || typeof value.pinned === "boolean")
    && (value.archived === undefined || value.archived === false);
}
