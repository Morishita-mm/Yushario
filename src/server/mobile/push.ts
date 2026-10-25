import { mobilePushPayload } from "../../core/mobile-pairing";
import { PERMISSION_TIMEOUT_MS } from "../../core/permissions";
import { mobilePermissionPushTtl, mobilePushLogEntry, parseMobilePushReceipt, parseMobilePushTicket, type MobilePushError,
  type MobilePushKind, type MobilePushLogEntry } from "../../core/mobile-push";
import { MobilePushLog } from "./push-log";
import { MOBILE_PUSH_CONTENT_TTL, type MobilePushContent } from "../../core/mobile-push-content";
import { sealMobilePush } from "./push-content";
import type { MobileDevice, MobileStore } from "./store";

type Job = { entry: MobilePushLogEntry; controller: AbortController; seq: number; test: boolean };
const RECEIPT_DELAYS = [5000, 30000, 120000];
function wait(delay: number, signal: AbortSignal): Promise<boolean> {
  return new Promise(resolve => {
    const finish = (ready: boolean): void => { clearTimeout(timer); signal.removeEventListener("abort", abort); resolve(ready); };
    const abort = (): void => finish(false);
    const timer = setTimeout(() => finish(true), delay).unref();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

// This log and receipt polling belong only to this gateway, not the phone protocol.
export class MobilePush {
  readonly log: MobilePushLog;
  private readonly jobs = new Map<number, Job>();
  private readonly latest = new Map<string, MobilePushLogEntry>();
  private closed = false;
  constructor(private readonly store: MobileStore) {
    this.log = new MobilePushLog(store.directory);
    for (const entry of this.log.latest()) this.latest.set(entry.deviceId, entry);
  }
  results(): MobilePushLogEntry[] {
    const ids = new Set(this.store.devices.map(device => device.id));
    for (const id of this.latest.keys()) if (!ids.has(id)) this.latest.delete(id);
    return [...this.latest.values()].map(mobilePushLogEntry);
  }
  // A targeted call is the Mac's explicit test push: it neither checks nor sets suppression.
  notify(kind: MobilePushKind, deviceId?: string, expiresAt = Date.now() + PERMISSION_TIMEOUT_MS, content?: MobilePushContent): void {
    if (this.closed) return;
    const test = deviceId !== undefined;
    const ttl = kind === "permission" ? mobilePermissionPushTtl(expiresAt, Date.now()) : undefined;
    if (ttl === 0) return;
    try {
      for (const device of this.store.devices.filter(device => deviceId === undefined || device.id === deviceId)) {
        if (!test && !device.pushPrefs[kind]) continue;
        if (!test && (device.notifiedKinds.includes(kind) || [...this.jobs.values()].some(job => !job.test
          && job.entry.deviceId === device.id && job.entry.kind === kind && job.seq === device.lastSeq && job.entry.ticketStatus === "pending"))) continue;
        const entry = mobilePushLogEntry({ time: this.log.nextTime(), deviceId: device.id, kind,
          ticketStatus: "pending", receiptStatus: "none", errorCode: null });
        if (!device.pushToken) { this.publish({ ...entry, ticketStatus: "skipped", errorCode: "NoPushToken" }); continue; }
        if (this.jobs.size >= 50) { this.publish({ ...entry, ticketStatus: "error", errorCode: "QueueFull" }); continue; }
        const job = { entry, controller: new AbortController(), seq: device.lastSeq, test };
        this.jobs.set(entry.time, job); this.publish(entry);
        void this.deliver(job, device, ttl, content ?? { kind, heroName: "勇者", town: "町",
          summary: test ? "テスト通知" : mobilePushPayload(kind).body,
          expiresAt: kind === "permission" ? expiresAt : Date.now() + MOBILE_PUSH_CONTENT_TTL, target: null }).catch(() => {
          if (!this.closed) this.update(job, "error", "unknown", "SendNetworkError");
        }).finally(() => this.jobs.delete(entry.time));
      }
    } catch { console.warn("Mobile push could not be started / 通知を開始できませんでした"); }
  }
  private publish(entry: MobilePushLogEntry): void {
    this.log.record(entry);
    if (entry.time >= (this.latest.get(entry.deviceId)?.time ?? -1)) this.latest.set(entry.deviceId, entry);
    if (this.latest.size > 50) {
      const oldest = [...this.latest.values()].sort((a, b) => a.time - b.time)[0]; this.latest.delete(oldest.deviceId);
    }
  }
  private update(job: Job, ticketStatus: MobilePushLogEntry["ticketStatus"], receiptStatus: MobilePushLogEntry["receiptStatus"], errorCode: MobilePushError | null): void {
    job.entry = mobilePushLogEntry({ ...job.entry, ticketStatus, receiptStatus, errorCode }); this.publish(job.entry);
  }
  private forgetInvalidToken(device: MobileDevice, error: MobilePushError): void {
    if (error !== "DeviceNotRegistered") return;
    try {
      if (this.store.devices.find(item => item.id === device.id)?.pushToken === device.pushToken) this.store.setPushToken(device.id, null);
    } catch { console.warn("Mobile push token removal failed / 失効した通知 ID を削除できませんでした"); }
  }
  private async deliver(job: Job, device: MobileDevice, ttl: number | undefined, content: MobilePushContent): Promise<void> {
    let body: string;
    try {
      if (content.kind !== job.entry.kind) throw Error("Push kind mismatch");
      const payload = device.pushPrefs.contentVersion === 1
        ? { priority: "high", _contentAvailable: true, data: sealMobilePush(content, this.store, device, Date.now()) }
        : mobilePushPayload(job.entry.kind);
      if (device.pushPrefs.contentVersion === 1 || content.kind === "permission") {
        const lifetime = content.kind === "permission" ? PERMISSION_TIMEOUT_MS : MOBILE_PUSH_CONTENT_TTL;
        ttl = Math.max(0, Math.floor(Math.min(lifetime, content.expiresAt - Date.now()) / 1000));
      }
      if (ttl === 0) throw Error("Expired push");
      body = JSON.stringify({ to: device.pushToken, ...payload, ...(ttl !== undefined ? { ttl } : {}) });
      // Include the routing token too, leaving no unbounded field outside the checked payload.
      if (Buffer.byteLength(body) > 4096) throw Error("Push too large");
    } catch { this.update(job, "error", "none", "PushPreparationFailed"); return; }
    const signal = () => AbortSignal.any([job.controller.signal, AbortSignal.timeout(10000)]);
    let ticket: ReturnType<typeof parseMobilePushTicket>;
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", { method: "POST", headers: { "Content-Type": "application/json" },
        body, signal: signal() });
      ticket = parseMobilePushTicket(await response.json().catch(() => undefined));
      if (!response.ok) ticket = { status: "error", errorCode: ticket.status === "error" && ticket.errorCode !== "InvalidResponse" ? ticket.errorCode : "SendHttpError" };
    } catch { ticket = { status: "error", errorCode: "SendNetworkError" }; }
    if (this.closed) return;
    if (ticket.status === "error") {
      this.update(job, "error", "none", ticket.errorCode); this.forgetInvalidToken(device, ticket.errorCode);
      console.warn("Mobile push ticket failed; see phone panel / 通知の受付に失敗（スマホ画面の記録を確認）"); return;
    }
    if (!job.test) {
      try { this.store.markNotified(device.id, job.entry.kind, job.seq); }
      catch { console.warn("Mobile push suppression could not be saved / 通知の重複抑止を保存できませんでした"); }
    }
    this.update(job, "ok", "pending", null);
    for (let attempt = 0; attempt < RECEIPT_DELAYS.length; attempt++) {
      if (!await wait(RECEIPT_DELAYS[attempt], job.controller.signal) || this.closed) return;
      let receipt: ReturnType<typeof parseMobilePushReceipt>;
      try {
        const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [ticket.id] }), signal: signal() });
        receipt = parseMobilePushReceipt(await response.json().catch(() => undefined), ticket.id);
        if (!response.ok) receipt = { status: "unknown", errorCode: "errorCode" in receipt && receipt.errorCode !== "InvalidResponse" ? receipt.errorCode : "ReceiptHttpError" };
      } catch { receipt = { status: "unknown", errorCode: "ReceiptNetworkError" }; }
      if (this.closed) return;
      const last = attempt === RECEIPT_DELAYS.length - 1;
      if (receipt.status === "ok") { this.update(job, "ok", "ok", null); return; }
      if (receipt.status === "error") {
        this.update(job, "ok", "error", receipt.errorCode); this.forgetInvalidToken(device, receipt.errorCode);
        console.warn("Mobile push receipt failed; see phone panel / 通知の配送に失敗（スマホ画面の記録を確認）"); return;
      }
      this.update(job, "ok", last ? "unknown" : receipt.status,
        "errorCode" in receipt ? receipt.errorCode : last ? "ReceiptNotFound" : null);
      if (last) console.warn("Mobile push receipt unconfirmed / 通知の配送結果は未確認です");
    }
  }
  close(): void {
    this.closed = true;
    for (const job of this.jobs.values()) {
      if (job.entry.ticketStatus === "pending" || ["pending", "unknown"].includes(job.entry.receiptStatus)) {
        this.update(job, job.entry.ticketStatus, "unknown", "GatewayStopped");
      }
      job.controller.abort();
    }
    this.jobs.clear();
  }
}
