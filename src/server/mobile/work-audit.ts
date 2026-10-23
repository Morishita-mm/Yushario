import { appendFileSync, chmodSync, closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { mobileBase64url, mobileInteger, mobileObject, mobileText } from "../../core/mobile-protocol";
export type MobileWorkNotice = { deviceId: string; operation: string; questId: string; heroId: string | null; time: number };
export function auditMobileWork(directory: string, entry: MobileWorkNotice): void {
  if (!valid(entry)) throw Error("Invalid work audit");
  const path = join(directory, "work-audit.jsonl"), line = JSON.stringify(entry) + "\n";
  if (existsSync(path) && statSync(path).size + Buffer.byteLength(line) > 32768) renameSync(path, path + ".1");
  const fd = openSync(path, "a", 0o600);
  try { chmodSync(path, 0o600); appendFileSync(fd, line); fsyncSync(fd); }
  finally { closeSync(fd); }
  const dir = openSync(directory, "r"); try { fsyncSync(dir); } finally { closeSync(dir); }
}
function valid(value: unknown): value is MobileWorkNotice {
  return mobileObject(value, ["deviceId", "operation", "questId", "heroId", "time"])
    && mobileBase64url(value.deviceId, 32) && mobileText(value.operation, 40) && mobileText(value.questId, 200)
    && (value.heroId === null || mobileText(value.heroId, 200)) && mobileInteger(value.time);
}
export function mobileWorkNotices(directory: string): MobileWorkNotice[] {
  const entries: MobileWorkNotice[] = [];
  for (const name of ["work-audit.jsonl.1", "work-audit.jsonl"]) {
    const path = join(directory, name);
    if (!existsSync(path)) continue;
    if (statSync(path).size > 32768) throw Error("Invalid work audit");
    for (const line of readFileSync(path, "utf8").trim().split("\n").filter(Boolean)) {
      const value: unknown = JSON.parse(line); if (!valid(value)) throw Error("Invalid work audit");
      entries.push(value);
    }
  }
  return entries.slice(-50);
}
