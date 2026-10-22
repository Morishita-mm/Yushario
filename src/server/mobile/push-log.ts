import { appendFileSync, closeSync, existsSync, fchmodSync, fstatSync, fsyncSync, ftruncateSync,
  openSync, readSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lastMobilePushResults, mobilePushLogEntry, parseMobilePushLogEntry, type MobilePushLogEntry } from "../../core/mobile-push";

const MAX_BYTES = 32768;
export class MobilePushLog {
  private records: MobilePushLogEntry[] = [];
  private sequence = 0;
  private readonly file: string;
  private readonly previous: string;
  constructor(private readonly directory: string) {
    this.file = join(directory, "push-delivery.jsonl"); this.previous = join(directory, "push-delivery.previous.jsonl");
    for (const file of [this.previous, this.file]) {
      if (!existsSync(file)) continue;
      try {
        const descriptor = openSync(file, "r+");
        try {
          fchmodSync(descriptor, 0o600);
          const size = fstatSync(descriptor).size, length = Math.min(size, MAX_BYTES), bytes = Buffer.alloc(length);
          readSync(descriptor, bytes, 0, length, size - length);
          const text = bytes.toString("utf8"), lines = (size > length ? text.slice(text.indexOf("\n") + 1) : text).split("\n");
          const valid: MobilePushLogEntry[] = [];
          for (const line of lines) {
            try { const entry = parseMobilePushLogEntry(JSON.parse(line)); if (entry) valid.push(entry); } catch { /* Ignore incomplete/corrupt lines. */ }
          }
          this.records.push(...valid);
          if (size > MAX_BYTES || text && !text.endsWith("\n")) { ftruncateSync(descriptor, 0); writeFileSync(descriptor, valid.slice(-50).map(entry => JSON.stringify(entry) + "\n").join("")); fsyncSync(descriptor); }
        } finally { closeSync(descriptor); }
      } catch { console.warn("Mobile push log could not be read / 通知の記録を読めませんでした"); }
    }
    this.sequence = Math.max(0, ...this.records.map(entry => entry.time));
    this.records = this.records.slice(-50);
    // Receipt IDs are intentionally not persisted; interrupted attempts cannot be resumed.
    for (const entry of this.latest()) if (entry.ticketStatus === "pending" && entry.receiptStatus === "none" || entry.receiptStatus === "pending") {
      this.record({ ...entry, receiptStatus: "unknown", errorCode: "Interrupted" });
    }
  }
  nextTime(): number { this.sequence = Math.max(Date.now(), this.sequence + 1); return this.sequence; }
  get entries(): MobilePushLogEntry[] { return this.records.map(mobilePushLogEntry); }
  latest(): MobilePushLogEntry[] { return lastMobilePushResults(this.records); }
  record(input: MobilePushLogEntry): void {
    const entry = mobilePushLogEntry(input);
    this.records.push(entry); this.records = this.records.slice(-50);
    this.sequence = Math.max(this.sequence, entry.time);
    try {
      const line = JSON.stringify(entry) + "\n";
      if (existsSync(this.file) && statSync(this.file).size + Buffer.byteLength(line) > MAX_BYTES) {
        rmSync(this.previous, { force: true }); renameSync(this.file, this.previous);
      }
      const descriptor = openSync(this.file, "a", 0o600);
      try { fchmodSync(descriptor, 0o600); appendFileSync(descriptor, line); fsyncSync(descriptor); } finally { closeSync(descriptor); }
      const directory = openSync(this.directory, "r");
      try { fsyncSync(directory); } finally { closeSync(directory); }
    } catch { console.warn("Mobile push log could not be saved / 通知の記録を保存できませんでした"); }
  }
}
