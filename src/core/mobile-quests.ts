import { mobileCursor, mobileInteger, mobileObject, mobileText } from "./mobile-protocol";

export type MobileTown = { id: string; name: string };
export type MobileQuest = {
  id: string; title: string; town: string;
  state: "open" | "active" | "waiting" | "review" | "done" | "dropped"; updatedAt: number;
};
export type MobileReport = {
  id: string; questId: string; questTitle: string; title: string; success: boolean | null;
  at: number; excerpt: string; text: string | null;
};
export type MobileQuestResponseBody =
  | { operation: "towns"; body: { towns: MobileTown[]; nextCursor: string | null } }
  | { operation: "quests"; body: { quests: MobileQuest[]; nextCursor: string | null } }
  | { operation: "quest-create"; body: { quest: MobileQuest } }
  | { operation: "reports"; body: { reports: MobileReport[]; nextCursor: string | null } };

export function mobileQuestValues(value: MobileQuest): unknown[] {
  return [value.id, value.title, value.town, value.state, value.updatedAt];
}
export function mobileReportValues(value: MobileReport): unknown[] {
  return [value.id, value.questId, value.questTitle, value.title, value.success, value.at, value.excerpt, value.text];
}
function isTown(value: unknown): value is MobileTown {
  return mobileObject(value, ["id", "name"]) && mobileText(value.id, 200) && mobileText(value.name, 200);
}
function isQuest(value: unknown): value is MobileQuest {
  return mobileObject(value, ["id", "title", "town", "state", "updatedAt"])
    && mobileText(value.id, 200) && mobileText(value.title, 200) && mobileText(value.town, 200)
    && ["open", "active", "waiting", "review", "done", "dropped"].includes(value.state as string) && mobileInteger(value.updatedAt);
}
function isReport(value: unknown): value is MobileReport {
  return mobileObject(value, ["id", "questId", "questTitle", "title", "success", "at", "excerpt", "text"])
    && mobileText(value.id, 200) && mobileText(value.questId, 200) && mobileText(value.questTitle, 200) && mobileText(value.title, 200)
    && (value.success === null || typeof value.success === "boolean") && mobileInteger(value.at)
    && mobileText(value.excerpt, 500, true) && (value.text === null || mobileText(value.text, 8000, true));
}
export function parseMobileQuestResponse(operation: unknown, body: unknown): MobileQuestResponseBody | undefined {
  if (operation === "quest-create") {
    if (mobileObject(body, ["quest"]) && isQuest(body.quest)) return { operation, body: { quest: body.quest } };
  } else if (operation === "towns") {
    if (mobileObject(body, ["towns", "nextCursor"]) && mobileCursor(body.nextCursor)
      && Array.isArray(body.towns) && body.towns.length <= 100 && body.towns.every(isTown)) {
      return { operation, body: { towns: body.towns, nextCursor: body.nextCursor } };
    }
  } else if (operation === "quests") {
    if (mobileObject(body, ["quests", "nextCursor"]) && mobileCursor(body.nextCursor)
      && Array.isArray(body.quests) && body.quests.length <= 100 && body.quests.every(isQuest)) {
      return { operation, body: { quests: body.quests, nextCursor: body.nextCursor } };
    }
  } else if (operation === "reports") {
    if (mobileObject(body, ["reports", "nextCursor"]) && mobileCursor(body.nextCursor)
      && Array.isArray(body.reports) && body.reports.length <= 50 && body.reports.every(isReport)
      && (body.reports.length <= 8 || body.reports.every(report => report.text === null))) {
      return { operation, body: { reports: body.reports, nextCursor: body.nextCursor } };
    }
  }
}
