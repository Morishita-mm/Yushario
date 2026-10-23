import { randomUUID } from "node:crypto";
import { validQuestPatch, type Quest, type QuestEvent } from "../../core/quests";
import { townKey, townLabel, type TownRecord } from "../../core/town-ledger";
import type { Room } from "../../core/room";
import type { MobileQuest, MobileReport, MobileTown, MobileQuestResponseBody } from "../../core/mobile-quests";
import type { MobileSignedRequest } from "../../core/mobile-protocol";
import type { QuestLedger } from "../quest-ledger";
import type { MobileStore } from "./store";
import { mobileShort } from "./operations";
import { reserveMobileQuest } from "./quest-requests";

const byId = (a: { id: string }, b: { id: string }): number => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
function page<T extends { id: string }>(items: T[], cursor: string | null, limit: number): { items: T[]; nextCursor: string | null } {
  const start = cursor === null ? 0 : items.findIndex(item => item.id === cursor) + 1;
  if (cursor !== null && start === 0) throw Error("Unknown cursor");
  const rows = items.slice(start, start + limit);
  return { items: rows, nextCursor: start + rows.length < items.length ? rows.at(-1)!.id : null };
}

// Only this gateway holds the random town-ID -> internal key mapping; never hash
// or encode a filesystem path into the public ID. Restart invalidates these IDs.
export class MobileQuests {
  private readonly townIds = new Map<string, string>();
  constructor(private readonly ledger: QuestLedger, private readonly towns: () => TownRecord[], private readonly room: () => Room | undefined) {}
  private townViews(): MobileTown[] {
    const towns = this.towns(), keys = new Set(towns.map(townKey));
    for (const key of this.townIds.keys()) if (!keys.has(key)) this.townIds.delete(key);
    return towns.map(town => {
      const key = townKey(town);
      if (!this.townIds.has(key)) this.townIds.set(key, randomUUID());
      return { id: this.townIds.get(key)!, name: mobileShort(townLabel(town, towns), 200, "町") };
    }).sort(byId);
  }
  // Internal town key for a gateway-issued town ID; only currently registered towns resolve.
  townKey(townId: string): string {
    this.townViews();
    const key = [...this.townIds].find(([, id]) => id === townId)?.[0];
    if (!key || !this.towns().some(town => townKey(town) === key)) throw Error("Unknown town");
    return key;
  }
  // The town key a room hero reports, for heroes without a PTY on this Mac.
  agentTown(agent: string): string | undefined { return this.room()?.agents.get(agent)?.project; }
  private questView(quest: Quest): MobileQuest {
    const towns = this.towns(), town = towns.find(town => townKey(town) === quest.town);
    return { id: quest.id, title: mobileShort(quest.title, 200, "クエスト"),
      town: mobileShort(town ? townLabel(town, towns) : "", 200, "町"), state: quest.state, updatedAt: quest.updatedAt };
  }
  private reportView(event: QuestEvent, full: boolean): MobileReport {
    const quest = this.ledger.summary(event.quest);
    if (!quest) throw Error("Unknown quest");
    // Read only the exact matching final reply. Never substitute a later answer,
    // a request, command output, permission content, or another hero's reply.
    const reply = event.hero ? this.room()?.agents.get(event.hero)?.talk.find(entry => entry.from === "hero" && entry.at === event.at) : undefined;
    const text = event.text ?? reply?.text;
    return { id: `report-${event.id}`, questId: quest.id, questTitle: mobileShort(quest.title, 200, "クエスト"),
      title: mobileShort(event.title, 200, "報告"),
      success: event.report?.stopFailure || event.report?.tests?.last === "failed" ? false : event.report?.tests?.last === "passed" ? true : null,
      at: event.at, excerpt: mobileShort(text ?? "", 500), text: full && text !== undefined ? mobileShort(text, 8000) : null };
  }
  operate(request: MobileSignedRequest, store: MobileStore): MobileQuestResponseBody {
    switch (request.operation) {
      case "towns": {
        const result = page(this.townViews(), request.body.cursor, 100);
        return { operation: "towns", body: { towns: result.items, nextCursor: result.nextCursor } };
      }
      case "quests": {
        const result = page(this.ledger.list().map(quest => this.questView(quest)).sort((a, b) => b.updatedAt - a.updatedAt || byId(a, b)), request.body.cursor, 100);
        return { operation: "quests", body: { quests: result.items, nextCursor: result.nextCursor } };
      }
      case "quest-create": {
        this.townViews();
        const { requestId, townId, title, purpose } = request.body;
        const key = [...this.townIds].find(([, id]) => id === townId)?.[0];
        // Same registration check, core validator and ledger creation as POST /api/quests.
        if (!key || !this.towns().some(town => townKey(town) === key) || !validQuestPatch({ title, purpose })) throw Error("Invalid quest");
        const now = Date.now(), id = reserveMobileQuest(store.directory, request.deviceId, requestId, now);
        const quest = this.ledger.create(key, title, purpose, now, id);
        return { operation: "quest-create", body: { quest: this.questView(quest) } };
      }
      case "reports": {
        if (!("questId" in request.body)) {
          return { operation: "reports", body: { reports: this.ledger.recentReports().map(event => this.reportView(event, false))
            .sort((a, b) => b.at - a.at || byId(a, b)), nextCursor: null } };
        }
        const quest = this.ledger.get(request.body.questId);
        if (!quest) throw Error("Unknown quest");
        const result = page(quest.events.filter(event => event.kind === "report").map(event => this.reportView(event, true))
          .sort((a, b) => a.at - b.at || byId(a, b)), request.body.cursor, 8);
        return { operation: "reports", body: { reports: result.items, nextCursor: result.nextCursor } };
      }
      default: throw Error("Invalid quest operation");
    }
  }
}
