import { randomUUID } from "node:crypto";
import { appendFileSync, chmodSync, closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mobileBase64url, mobileInteger, mobileObject, mobileQuestRequestTime, mobileText } from "../../core/mobile-protocol";

export type WorkEffect = "none" | "send" | "spawn" | "depart";
type Reservation = { requestId: string; deviceId: string; questId: string; time: number; operation?: string; effect?: WorkEffect };
function valid(value: unknown): value is Reservation {
  const shape = mobileObject(value, ["requestId", "deviceId", "questId", "time"])
    || mobileObject(value, ["requestId", "deviceId", "questId", "time", "operation", "effect"]);
  return shape && mobileQuestRequestTime(value.requestId) !== undefined && mobileBase64url(value.deviceId, 32)
    && mobileText(value.questId, 200) && mobileInteger(value.time)
    && (value.operation === undefined || mobileText(value.operation, 40) && ["none", "send", "spawn", "depart"].includes(value.effect as string));
}
export function syncMobileDirectory(directory: string): void {
  const fd = openSync(directory, "r"); try { fsyncSync(fd); } finally { closeSync(fd); }
}
export function writeMobileState(directory: string, name: string, value: unknown): void {
  const temp = join(directory, `.work-${randomUUID()}`);
  try {
    const fd = openSync(temp, "wx", 0o600);
    try { writeFileSync(fd, JSON.stringify(value)); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temp, join(directory, name)); syncMobileDirectory(directory);
  } finally { rmSync(temp, { force: true }); }
}

// A1 and all work mutations share the same reservation namespace. Reserve before
// effects; on a crash an operation may be lost, but an ID can never execute twice.
export function reserveMobileMutation(directory: string, deviceId: string, requestId: string, operation: string,
  questId: string, effect: WorkEffect = "none", now = Date.now()): void {
  const issuedAt = mobileQuestRequestTime(requestId);
  if (issuedAt === undefined || issuedAt > now + 60_000 || now >= issuedAt + 600_000) throw Error("Invalid creation ID");
  const file = join(directory, "quest-requests.json");
  const saved: unknown = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
  if (!Array.isArray(saved) || saved.length > 1000 || !saved.every(valid)) throw Error("Invalid reservations");
  const records = saved.filter(entry => now < Math.max(mobileQuestRequestTime(entry.requestId)! + 600_000, entry.time + (entry.effect === "spawn" ? 3600_000 : 60_000)));
  const recent = records.filter(entry => entry.deviceId === deviceId && entry.time > now - 60_000);
  if (records.some(entry => entry.requestId === requestId) || records.length >= 1000 || recent.length >= 5
    || effect !== "none" && recent.filter(entry => entry.effect && entry.effect !== "none").length >= 2
    || effect === "spawn" && (recent.some(entry => entry.effect === "spawn")
      || records.filter(entry => entry.deviceId === deviceId && entry.effect === "spawn" && entry.time > now - 3600_000).length >= 3)) throw Error("Work rate rejected");
  writeMobileState(directory, "quest-requests.json", [...records, { requestId, deviceId, questId, time: now, operation, effect }]);
}
export function reserveMobileQuest(directory: string, deviceId: string, requestId: string, now: number): string {
  const questId = randomUUID();
  reserveMobileMutation(directory, deviceId, requestId, "quest-create", questId, "none", now);
  const audit = join(directory, "quest-creations.jsonl"), fd = openSync(audit, "a", 0o600);
  try {
    chmodSync(audit, 0o600);
    appendFileSync(fd, JSON.stringify({ deviceId, questId, time: now }) + "\n");
    fsyncSync(fd); syncMobileDirectory(directory);
  } finally { closeSync(fd); }
  return questId;
}
