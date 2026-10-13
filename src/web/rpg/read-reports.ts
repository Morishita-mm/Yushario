import type { RoomAgent } from "../../core/room";

// Only identities and times are persisted, never the reply or its tally.
const KEY = "yushario-read-reports";
let read: [string, number][] = [];
try {
  const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
  if (Array.isArray(saved)) read = saved.filter((item): item is [string, number] =>
    Array.isArray(item) && item.length === 2 && typeof item[0] === "string" && Number.isFinite(item[1])).slice(-200);
} catch { /* Storage may be unavailable; reading still works for this page. */ }

export function reportRead(id: string, at: number): boolean {
  return read.some(([hero, time]) => hero === id && time === at);
}

export function markReportRead(id: string, at: number): void {
  if (reportRead(id, at)) return;
  read.push([id, at]);
  read = read.slice(-200);
  try { localStorage.setItem(KEY, JSON.stringify(read)); } catch { /* Page-local fallback. */ }
}

export function unreadReports(agent: RoomAgent): RoomAgent["talk"] {
  return agent.talk.filter((entry) => entry.from === "hero" && !reportRead(agent.id, entry.at));
}

// A read badge stays until the next request; older unread replies remain discoverable.
export function latestReport(agent: RoomAgent): RoomAgent["talk"][number] | undefined {
  const latest = agent.talk[agent.talk.length - 1];
  return latest?.from === "hero" ? latest : undefined;
}
