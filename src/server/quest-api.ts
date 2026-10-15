import type { IncomingMessage, ServerResponse } from "node:http";
import { realpath } from "node:fs/promises";
import { validQuestPatch, type QuestDetail } from "../core/quests";
import { validAdoption, type QuestDecision } from "../core/decisions";
import { checkMark } from "../core/checks";
import { reviewBasePath, type ReviewResult } from "../core/review-base";
import { reviewResult } from "./review";
import { workFingerprint } from "./checks";
import { townKey, type TownRecord } from "../core/town-ledger";
import { readJsonBody, ACTION_BODY_LIMIT } from "./http-body";
import type { QuestLedger } from "./quest-ledger";
import type { TerminalSession } from "./pty-session";
import { tr } from "./language";

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(value));
}
// The accepted base as it is now: branch, HEAD, working-state fingerprint and each check's mark.
async function acceptedState(quest: QuestDetail): Promise<[ReviewResult | undefined, QuestDecision]> {
  const checks = (quest.checks ?? []).map((check) => ({ name: check.name, mark: checkMark(check.evidence, quest.fingerprint) }));
  const path = reviewBasePath(quest);
  if (!path) return [undefined, { checks }];
  try {
    const cwd = await realpath(path), [result, fingerprint] = await Promise.all([reviewResult(cwd), workFingerprint(cwd)]);
    return [result, { checks, ...(fingerprint ? { changes: fingerprint.changes } : {}) }];
  } catch { return [{ cwd: path }, { checks }]; }
}
export async function handleQuestRequest(request: IncomingMessage, response: ServerResponse, url: URL,
  quests: QuestLedger, towns: TownRecord[], session: (id: string) => TerminalSession | undefined): Promise<void> {
  try {
    const parts = url.pathname.split("/");
    const id = parts[3] ? decodeURIComponent(parts[3]) : undefined;
    const method = request.method;
    // town in query/JSON is the town key, not its display name.
    if (!id && method === "GET") { json(response, 200, quests.list().filter((quest) => !url.searchParams.has("town") || quest.town === url.searchParams.get("town"))); return; }
    if (!id && method === "DELETE") {
      const key = url.searchParams.get("town") ?? undefined;
      if (key && !towns.some((item) => townKey(item) === key)) { json(response, 404, { error: tr("町が みつからない", "Town not found") }); return; }
      quests.clear(key); response.writeHead(204).end(); return;
    }
    if (id === "report-link" && method === "GET") {
      const at = Number(url.searchParams.get("at"));
      json(response, 200, Number.isFinite(at) ? quests.reportLink(url.searchParams.get("hero") ?? "", at) ?? null : null); return;
    }
    if (id && !quests.summary(id)) { json(response, 404, { error: tr("クエストが みつからない", "Quest not found") }); return; }
    if (id && !parts[4] && method === "GET") { json(response, 200, quests.get(id)); return; }
    if (id && !parts[4] && method === "DELETE") { quests.delete(id); response.writeHead(204).end(); return; }
    if (id && parts[4] === "base" && method === "DELETE") { quests.clearWorktree(id); response.writeHead(204).end(); return; }
    if (!["POST", "PATCH"].includes(method ?? "")) { response.writeHead(405).end(); return; }
    const body = await readJsonBody(request, response, ACTION_BODY_LIMIT);
    if (!body.ok) return;
    const input = body.value && typeof body.value === "object" && !Array.isArray(body.value) ? body.value as Record<string, unknown> : {};
    if (!id && method === "POST") {
      const { town: key, ...patch } = input;
      if (typeof key !== "string" || !towns.some((item) => townKey(item) === key) || !validQuestPatch(patch) || !patch.title) {
        json(response, 400, { error: tr("町と クエストの 題を えらんで", "Choose a town and quest title") }); return;
      }
      json(response, 201, quests.create(key, patch.title, patch.purpose)); return;
    }
    if (id && parts[4] === "base" && method === "POST") {
      const chosen = typeof input.session === "string" ? session(input.session) : undefined;
      if (!chosen || chosen.exited || quests.get(id)?.town !== chosen.project) { json(response, 400, { error: tr("この町の 拠点を えらんで", "Choose a base in this town") }); return; }
      quests.setWorktree(id, { path: chosen.cwd, branch: chosen.branch }); json(response, 200, quests.get(id)); return;
    }
    if (id && parts[4] === "assign" && method === "POST") {
      const chosen = typeof input.session === "string" ? session(input.session) : undefined;
      if (!chosen || chosen.exited) { json(response, 404, { error: tr("勇者が みつからない", "Hero not found") }); return; }
      quests.assign(id, chosen); json(response, 200, quests.get(id)); return;
    }
    if (id && parts[4] === "adopt" && method === "POST") {
      const choice = validAdoption(input);
      if (!choice) { json(response, 400, { error: tr("理由は 500文字まで、PR は https の URL で", "Use a reason up to 500 characters and an https PR URL") }); return; }
      const [result, state] = await acceptedState(quests.get(id)!);
      json(response, 200, quests.adopt(id, result, { ...state, ...choice })); return;
    }
    if (id && !parts[4] && method === "PATCH" && validQuestPatch(input)) {
      json(response, 200, quests.patch(id, input)); return;
    }
    json(response, 400, { error: tr("クエストの ことばが ちがう", "Invalid quest details") });
  } catch (error) { json(response, 400, { error: error instanceof Error ? error.message : tr("クエストを のこせない", "Could not save quest") }); }
}
