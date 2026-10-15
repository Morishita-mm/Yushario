import type { IncomingMessage, ServerResponse } from "node:http";
import { validQuestCheck } from "../core/checks";
import { ACTION_BODY_LIMIT, readJsonBody } from "./http-body";
import { tr } from "./language";
import type { QuestLedger } from "./quest-ledger";
import type { TerminalSession } from "./pty-session";
import { questCheckBase, refreshCheckFingerprint, scriptCandidates } from "./checks";
export async function handleChecksRequest(request: IncomingMessage, response: ServerResponse, url: URL,
  quests: QuestLedger, sessions: () => TerminalSession[]): Promise<boolean> {
  const parts = url.pathname.split("/");
  const report = parts[3] === "checks-report";
  if (!report && parts[4] !== "checks" && !(parts[3] && !parts[4] && request.method === "GET")) return false;
  const json = (status: number, value: unknown) => response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(value));
  try {
    const quest = report ? quests.list().find((quest) => quests.get(quest.id)?.events.some((event) => event.kind === "report"
      && event.session === url.searchParams.get("session") && event.at === Number(url.searchParams.get("at")))) : quests.get(decodeURIComponent(parts[3]));
    if (!quest) { if (report) { json(200, { checks: [] }); return true; } return false; }
    const known = sessions(), base = questCheckBase(quests, quest.id, known);
    if (request.method === "GET") {
      await refreshCheckFingerprint(quests, quest.id, known);
      if (parts[4] !== "checks" && !report) return false;
      json(200, { quest: quest.id, checks: quests.checks.list(quest.id), fingerprint: quests.checks.fingerprints.get(quest.id),
        candidates: base ? await scriptCandidates(base) : [] }); return true;
    }
    if (report) { response.writeHead(405).end(); return true; }
    if (request.method === "POST" && !parts[5]) {
      const body = await readJsonBody(request, response, ACTION_BODY_LIMIT);
      if (!body.ok) return true;
      if (!validQuestCheck(body.value)) { json(400, { error: tr("名前と コマンドの形を かいて", "Write a name and command shape") }); return true; }
      quests.checks.add(quest.id, body.value); quests.checksChanged(); json(201, { checks: quests.checks.list(quest.id) }); return true;
    }
    if (request.method === "DELETE" && parts[5]) {
      quests.checks.remove(quest.id, decodeURIComponent(parts[5])); quests.checksChanged(); response.writeHead(204).end(); return true;
    }
    response.writeHead(405).end(); return true;
  } catch { json(400, { error: tr("ためすことを よめない", "Cannot read checks") }); return true; }
}
