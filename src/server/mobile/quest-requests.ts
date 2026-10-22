import { randomUUID } from "node:crypto";
import { appendFileSync, chmodSync, closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mobileBase64url, mobileInteger, mobileObject, mobileQuestRequestTime, mobileText } from "../../core/mobile-protocol";

type Reservation = { requestId: string; deviceId: string; questId: string; time: number };
function valid(value: unknown): value is Reservation {
  return mobileObject(value, ["requestId", "deviceId", "questId", "time"])
    && mobileQuestRequestTime(value.requestId) !== undefined && mobileBase64url(value.deviceId, 32)
    && mobileText(value.questId, 200) && mobileInteger(value.time);
}
function syncDirectory(directory: string): void {
  const fd = openSync(directory, "r");
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

// The MobileStore's exclusive directory lock also covers these files. Reserve before
// touching QuestLedger: a crash can lose a creation, but can never duplicate it.
export function reserveMobileQuest(directory: string, deviceId: string, requestId: string, now: number): string {
  const issuedAt = mobileQuestRequestTime(requestId);
  if (issuedAt === undefined || issuedAt > now + 60_000 || now >= issuedAt + 600_000) throw Error("Invalid creation ID");
  const file = join(directory, "quest-requests.json");
  const saved: unknown = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
  if (!Array.isArray(saved) || saved.length > 1000 || !saved.every(valid)) throw Error("Invalid creation reservations");
  const records = saved.filter(entry => now < Math.max(mobileQuestRequestTime(entry.requestId)! + 600_000, entry.time + 60_000));
  if (records.some(entry => entry.requestId === requestId) || records.length >= 1000
    || records.filter(entry => entry.deviceId === deviceId && entry.time > now - 60_000).length >= 5) throw Error("Creation rejected");
  const entry = { requestId, deviceId, questId: randomUUID(), time: now };
  const temp = join(directory, `.quests-${randomUUID()}`);
  try {
    const fd = openSync(temp, "wx", 0o600);
    try { writeFileSync(fd, JSON.stringify([...records, entry])); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temp, file); syncDirectory(directory);
  } finally { rmSync(temp, { force: true }); }
  // Audit is deliberately before creation too. A reserved ID may have no quest if
  // disk I/O or the process failed; the audit does not claim an agent ran.
  const audit = join(directory, "quest-creations.jsonl"), fd = openSync(audit, "a", 0o600);
  try {
    chmodSync(audit, 0o600);
    appendFileSync(fd, JSON.stringify({ deviceId, questId: entry.questId, time: now }) + "\n");
    fsyncSync(fd); syncDirectory(directory);
  } finally { closeSync(fd); }
  return entry.questId;
}
