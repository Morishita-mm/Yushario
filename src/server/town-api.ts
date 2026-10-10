import type { IncomingMessage, ServerResponse } from "node:http";
import { activateTown, archiveTowns, registerTown, type TownRecord, type TownTheme } from "../core/town-ledger";
import { namedHero, normalizeHeroName, type HeroNames } from "../core/names";
import { isClaudeSessionId } from "../core/roster";
import { readNames, readSettings, readTowns, validSettings, validTheme, writeNames, writeSettings, writeTowns } from "./town-data";

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" })
    .end(JSON.stringify(value));
}

// Town and display preferences only: no session, report, or conversation history.
export class TownLedger {
  towns = readTowns();
  names = readNames();
  private settings = readSettings();

  constructor(private readonly changed: (towns: TownRecord[]) => void,
    private readonly namesChanged: (names: HeroNames) => void) {}

  private save(towns: TownRecord[]): void {
    if (towns === this.towns) return;
    writeTowns(towns);
    this.towns = towns;
    this.changed(towns);
  }

  register(name: string, path: string, now: number): void {
    this.save(registerTown(this.towns, name, path, now));
  }

  observe(name: string, now: number): void {
    this.save(activateTown(this.towns, name, now));
  }

  archive(activeNames: ReadonlySet<string>, now: number): void {
    this.save(archiveTowns(this.towns, activeNames, this.settings.archiveAfterDays, now));
  }

  async handleRequest(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    if (url.pathname === "/api/towns" && request.method === "GET") {
      json(response, 200, this.towns);
      return;
    }
    if (url.pathname === "/api/settings" && request.method === "GET") {
      json(response, 200, this.settings);
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
      catch { json(response, 400, { error: "Invalid Claude sessionId" }); return; }
      if (!isClaudeSessionId(name)) { json(response, 400, { error: "Invalid Claude sessionId" }); return; }
    }
    if (patch) {
      try { name = decodeURIComponent(url.pathname.slice("/api/towns/".length)); }
      catch { json(response, 400, { error: "Invalid town name" }); return; }
      if (!this.towns.some((town) => town.name === name)) {
        json(response, 404, { error: "Unknown town" });
        return;
      }
    }
    let input: unknown;
    try {
      let body = "";
      request.setEncoding("utf8");
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 4096) { json(response, 400, { error: "Body too large" }); return; }
      }
      input = JSON.parse(body);
    } catch { json(response, 400, { error: "Invalid JSON body" }); return; }
    try {
      if (rename) {
        const value = input && typeof input === "object" && !Array.isArray(input)
          ? (input as Record<string, unknown>).name : undefined;
        const chosen = normalizeHeroName(value);
        if (chosen === undefined) {
          json(response, 400, { error: "name must be a string of 1–24 characters, or empty to reset" });
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
          json(response, 400, { error: "archiveAfterDays must be an integer between 0 and 365" });
          return;
        }
        if (input.archiveAfterDays !== this.settings.archiveAfterDays) {
          writeSettings(input);
          this.settings = input;
          this.changed(this.towns);
        }
        json(response, 200, this.settings);
      } else {
        if (!validPatch(input)) {
          json(response, 400, { error: "Expected { theme?, pinned?, archived?: false }" });
          return;
        }
        const town = this.towns.find((town) => town.name === name)!;
        if ((input.theme !== undefined && input.theme !== town.theme)
          || (input.pinned !== undefined && input.pinned !== town.pinned)
          || (input.archived === false && town.archivedAt !== undefined)) {
          const updated = { ...town };
          if (input.theme !== undefined) updated.theme = input.theme;
          if (input.pinned !== undefined) updated.pinned = input.pinned;
          if (input.archived === false) delete updated.archivedAt;
          this.save(this.towns.map((item) => item === town ? updated : item));
        }
        json(response, 200, this.towns.find((town) => town.name === name));
      }
    } catch (error) {
      console.error("Town save failed:", error instanceof Error ? error.message : String(error));
      json(response, 500, { error: "Could not save town data" });
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
