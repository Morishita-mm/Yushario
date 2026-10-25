import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MobilePushLogEntry } from "../../core/mobile-push";
import { MobilePushLog } from "./push-log";

let directory: string;
const entry: MobilePushLogEntry = { time: 1700000000000, deviceId: "A".repeat(43), kind: "permission",
  ticketStatus: "ok", receiptStatus: "ok", errorCode: null };
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), "yushario-push-log-")); });
afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe("bounded private push delivery log", () => {
  it("keeps 50 events in memory, at most two 32KiB files, and reloads results with mode 0600", () => {
    const log = new MobilePushLog(directory);
    for (let index = 0; index < 400; index++) log.record({ ...entry, time: entry.time + index });
    expect(log.entries).toHaveLength(50); expect(log.entries[0].time).toBe(entry.time + 350);
    const files = readdirSync(directory);
    expect(files.sort()).toEqual(["push-delivery.jsonl", "push-delivery.previous.jsonl"]);
    for (const file of files) {
      const stat = statSync(join(directory, file)); expect(stat.mode & 0o777).toBe(0o600); expect(stat.size).toBeLessThanOrEqual(32768);
    }
    const restored = new MobilePushLog(directory);
    expect(restored.latest()).toEqual([{ ...entry, time: entry.time + 399 }]);
    expect(restored.nextTime()).toBeGreaterThan(entry.time + 399);
    expect(readFileSync(join(directory, "push-delivery.jsonl"), "utf8")).not.toContain("token");
  });
  it("marks a previous pending attempt interrupted once, rather than pretending receipt success", () => {
    const first = new MobilePushLog(directory); first.record({ ...entry, receiptStatus: "pending" });
    const second = new MobilePushLog(directory);
    expect(second.latest()[0]).toMatchObject({ ticketStatus: "ok", receiptStatus: "unknown", errorCode: "Interrupted" });
    const size = statSync(join(directory, "push-delivery.jsonl")).size;
    const third = new MobilePushLog(directory);
    expect(third.latest()[0].errorCode).toBe("Interrupted"); expect(statSync(join(directory, "push-delivery.jsonl")).size).toBe(size);
  });
  it("recovers a partial final JSONL line without losing subsequent valid events", () => {
    const log = new MobilePushLog(directory); log.record(entry);
    appendFileSync(join(directory, "push-delivery.jsonl"), "{partial");
    const restored = new MobilePushLog(directory); restored.record({ ...entry, time: entry.time + 1 });
    expect(new MobilePushLog(directory).latest()[0].time).toBe(entry.time + 1);
  });
  it("reads only a bounded tail and compacts an oversized log", () => {
    const file = join(directory, "push-delivery.jsonl");
    writeFileSync(file, Array.from({ length: 500 }, (_, index) => JSON.stringify({ ...entry, time: entry.time + index }) + "\n").join(""));
    const restored = new MobilePushLog(directory);
    expect(restored.entries).toHaveLength(50); expect(restored.latest()[0].time).toBe(entry.time + 499);
    expect(statSync(file).size).toBeLessThanOrEqual(32768); expect(statSync(file).mode & 0o777).toBe(0o600);
  });
});
