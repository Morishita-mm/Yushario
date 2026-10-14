import type { IncomingMessage, ServerResponse } from "node:http";
import { previewUrl } from "../core/preview";
import { townKey, type TownRecord } from "../core/town-ledger";
import type { QuestLedger } from "./quest-ledger";
import type { TerminalSession } from "./pty-session";
import { readJsonBody, ACTION_BODY_LIMIT } from "./http-body";
import { tr } from "./language";

export async function handlePreview(request: IncomingMessage, response: ServerResponse, url: URL, port: number,
  quests: QuestLedger, towns: TownRecord[], sessions: TerminalSession[]): Promise<void> {
  const json = (status: number, value: unknown): void => {
    response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(value));
  };
  try {
    const questId = url.searchParams.get("quest"), quest = questId ? quests.get(questId) : undefined;
    const town = quest?.town ?? url.searchParams.get("town");
    if (questId && !quest || !town || !towns.some((item) => townKey(item) === town)) {
      json(404, { error: tr("町か クエストが みつからない", "Town or quest not found") }); return;
    }
    const links = quests.previews.list(questId, town);
    if (request.method === "GET") {
      const candidates = [...new Set(sessions.filter((session) => session.project === town &&
        (!questId || quests.current(session.id)?.id === questId || !quests.current(session.id)))
        .flatMap((session) => session.previewUrls ?? []))];
      json(200, { links, candidates: candidates.filter((candidate) => previewUrl(candidate, port).ok) }); return;
    }
    if (request.method === "DELETE") {
      const id = url.searchParams.get("id");
      if (!links.some((link) => link.id === id)) { json(404, { error: tr("プレビューが みつからない", "Preview not found") }); return; }
      quests.previews.remove(id!); response.writeHead(204).end(); return;
    }
    if (request.method !== "POST") { response.writeHead(405).end(); return; }
    const body = await readJsonBody(request, response, ACTION_BODY_LIMIT);
    if (!body.ok) return;
    const input = body.value as Record<string, unknown> | null;
    const checked = previewUrl(input?.url, port);
    if (!checked.ok) {
      const error = checked.reason === "self" ? tr("Yushario の ポートは つなげない", "Yushario's own port cannot be linked")
        : checked.reason === "port" ? tr("ポートは 1〜65535 に して", "Choose a port from 1 to 65535")
        : tr("この PC の URLを えらんで", "Choose a local URL");
      json(400, { error }); return;
    }
    if (input?.name !== undefined && (typeof input.name !== "string" || input.name.length > 200)) {
      json(400, { error: tr("名前は 200文字まで", "Names may have up to 200 characters") }); return;
    }
    json(201, quests.previews.add(questId, town, typeof input?.name === "string" ? input.name.trim() : "", checked.url));
  } catch { json(400, { error: tr("プレビューを のこせない", "Could not save preview") }); }
}
