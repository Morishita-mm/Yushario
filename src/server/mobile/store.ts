import { randomUUID } from "node:crypto";
import { appendFileSync, chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync,
  readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { mobileBase64url, mobileInteger, mobileObject, mobilePushToken, mobileText } from "../../core/mobile-protocol";
import { generateMobileIdentity, mobileIdentity, type MobileIdentity } from "./crypto";
import type { MobilePushKind } from "../../core/mobile-push";
import { isMobilePushPrefs, MOBILE_PUSH_DEFAULTS, type MobilePushPrefs } from "../../core/mobile-push-content";

export type MobileDevice = { id: string; phoneEncryptionKey: string; phoneSigningKey: string; name: string;
  pushToken: string | null; lastSeq: number; createdAt: number; lastSeenAt: number; allowWork: boolean; notifiedKinds: MobilePushKind[];
  pushPrefs: MobilePushPrefs; pushSeq: number };
export type MobileAudit = { deviceId: string; permissionId: string; result: "allow" | "deny"; time: number };

const deviceKeys = ["id", "phoneEncryptionKey", "phoneSigningKey", "name", "pushToken", "lastSeq", "createdAt", "lastSeenAt"];
function validDevice(value: unknown): value is MobileDevice {
  return mobileObject(value, [...deviceKeys, "allowWork", "notifiedKinds", "pushPrefs", "pushSeq"]) && typeof value.allowWork === "boolean"
    && isMobilePushPrefs(value.pushPrefs) && mobileInteger(value.pushSeq)
    && Array.isArray(value.notifiedKinds) && value.notifiedKinds.length <= 3
    && value.notifiedKinds.every(kind => ["permission", "report", "error"].includes(kind))
    && new Set(value.notifiedKinds).size === value.notifiedKinds.length
    && mobileBase64url(value.id, 32) && mobileBase64url(value.phoneEncryptionKey, 32) && mobileBase64url(value.phoneSigningKey, 32)
    && mobileText(value.name, 80) && !/[\u0000-\u001f\u007f]/.test(value.name) && mobilePushToken(value.pushToken)
    && mobileInteger(value.lastSeq, 1) && mobileInteger(value.createdAt) && mobileInteger(value.lastSeenAt);
}

// Older records default to no work capability and no unseen notifications, without resetting keys/sequence.
function storedDevice(input: unknown): MobileDevice | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return;
  // A partially missing A8 record is corruption, not an old registration: never reset a used nonce counter.
  if (Object.hasOwn(input, "pushPrefs") !== Object.hasOwn(input, "pushSeq")) return;
  const value = { allowWork: false, notifiedKinds: [], pushPrefs: { ...MOBILE_PUSH_DEFAULTS }, pushSeq: 0, ...input };
  return validDevice(value) ? value : undefined;
}

// One mobile gateway owns this directory. Locking prevents two processes reusing response nonces.
export class MobileStore {
  readonly identity: MobileIdentity;
  private records: MobileDevice[] = [];
  private readonly lock: string;
  private readonly stateFile: string;
  private closed = false;
  constructor(readonly directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
    this.lock = resolve(directory, "gateway.lock"); this.stateFile = join(directory, "state.json");
    let descriptor: number;
    try { descriptor = openSync(this.lock, "wx", 0o600); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") throw this.lockFailure(); throw error; }
    // Never reclaim a stale path automatically: another starter could own it by the time we unlink it.
    try {
      writeFileSync(descriptor, JSON.stringify({ pid: process.pid, startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString() }));
      fsyncSync(descriptor);
    } finally { closeSync(descriptor); }
    try {
      if (existsSync(this.stateFile)) {
        chmodSync(this.stateFile, 0o600);
        const value: unknown = JSON.parse(readFileSync(this.stateFile, "utf8"));
        if (!mobileObject(value, ["v", "encryptionPrivateKey", "signingPrivateKey", "devices"]) || value.v !== 1
          || typeof value.encryptionPrivateKey !== "string" || typeof value.signingPrivateKey !== "string"
          || !Array.isArray(value.devices) || value.devices.length > 5 || !value.devices.every(device => storedDevice(device))
          || new Set(value.devices.map(device => device.id)).size !== value.devices.length) throw Error("Invalid mobile state; preserve the file and repair it manually");
        this.identity = mobileIdentity(value.encryptionPrivateKey, value.signingPrivateKey);
        this.records = value.devices.map(device => storedDevice(device)!);
      } else {
        this.identity = generateMobileIdentity(); this.save([]);
      }
    } catch (error) { rmSync(this.lock, { force: true }); throw error; }
  }
  get devices(): MobileDevice[] { return this.records.map(device => ({ ...device, notifiedKinds: [...device.notifiedKinds], pushPrefs: { ...device.pushPrefs } })); }
  private lockFailure(): Error {
    let owner = "";
    try {
      const value: unknown = JSON.parse(readFileSync(this.lock, "utf8"));
      const record = mobileObject(value, ["pid", "startedAt"]) ? value : undefined;
      const pid = typeof value === "number" ? value : record?.pid;
      if (mobileInteger(pid, 1)) {
        const startedAt = record?.startedAt;
        owner = ` (PID=${pid}${typeof startedAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(startedAt) ? `, startedAt=${startedAt}` : ""})`;
      }
    } catch { /* An unreadable/malformed lock must still prevent startup; never print its raw contents. */ }
    const command = `rm -- '${this.lock.replaceAll("'", "'\\''")}'`;
    return Error(`Mobile data locked${owner}; confirm no Yushario with this AGENT_CHARACTER_HOME is running; remove ONLY lock, keep state.json. / ロック中。同じ AGENT_CHARACTER_HOME の Yushario が動いていないことを確認し、state.json は残してロック1ファイルだけ削除: ${command}`);
  }
  private save(devices: MobileDevice[]): void {
    if (this.closed) throw Error("Mobile store is closed");
    const temp = join(this.directory, `.state-${randomUUID()}`);
    const descriptor = openSync(temp, "wx", 0o600);
    try {
      try {
        writeFileSync(descriptor, JSON.stringify({ v: 1, encryptionPrivateKey: this.identity.encryptionPrivateKey,
          signingPrivateKey: this.identity.signingPrivateKey, devices }));
        fsyncSync(descriptor);
      } finally { closeSync(descriptor); }
      renameSync(temp, this.stateFile);
      const directory = openSync(this.directory, "r");
      try { fsyncSync(directory); } finally { closeSync(directory); }
      this.records = devices;
    } finally { rmSync(temp, { force: true }); }
  }
  // Only Mac confirmation or setAllowWork may opt in; later updates preserve that choice.
  put(input: Omit<MobileDevice, "allowWork" | "notifiedKinds" | "pushPrefs" | "pushSeq">
    & { allowWork?: boolean; notifiedKinds?: MobilePushKind[]; pushPrefs?: MobilePushPrefs; pushSeq?: number }): void {
    const previous = this.records.find(item => item.id === input.id);
    const device = { ...input, allowWork: input.allowWork ?? previous?.allowWork ?? false,
      notifiedKinds: [...(input.notifiedKinds ?? previous?.notifiedKinds ?? [])],
      pushPrefs: { ...(input.pushPrefs ?? previous?.pushPrefs ?? MOBILE_PUSH_DEFAULTS) }, pushSeq: input.pushSeq ?? previous?.pushSeq ?? 0 };
    if (!validDevice(device)) throw Error("Invalid mobile device");
    if (previous && (previous.phoneEncryptionKey !== device.phoneEncryptionKey || previous.phoneSigningKey !== device.phoneSigningKey
      || device.lastSeq < previous.lastSeq || device.pushSeq < previous.pushSeq)) throw Error("Cannot reset mobile identity or sequence");
    const records = this.records.filter(item => item.id !== device.id);
    if (records.length >= 5) throw Error("Too many mobile devices");
    this.save([...records, device]);
  }
  remove(id: string): boolean {
    if (!this.records.some(device => device.id === id)) return false;
    this.save(this.records.filter(device => device.id !== id)); return true;
  }
  advance(id: string, seq: number, at: number): MobileDevice {
    const previous = this.records.find(device => device.id === id);
    if (!previous || !mobileInteger(seq, 1) || seq <= previous.lastSeq || !mobileInteger(at)) throw Error("Invalid mobile sequence");
    const device = { ...previous, lastSeq: seq, lastSeenAt: at, notifiedKinds: [] };
    this.put(device); return device;
  }
  markNotified(id: string, kind: MobilePushKind, sentAtSeq: number): void {
    const device = this.records.find(item => item.id === id);
    // A late ticket cannot re-suppress a phone that has already connected, or recreate a revoked device.
    if (!device || device.lastSeq !== sentAtSeq || device.notifiedKinds.includes(kind)) return;
    this.put({ ...device, notifiedKinds: [...device.notifiedKinds, kind] });
  }
  reservePush(id: string): number {
    const device = this.records.find(item => item.id === id);
    if (!device || device.pushSeq >= Number.MAX_SAFE_INTEGER) throw Error("Push sequence unavailable; re-pair");
    const seq = device.pushSeq + 1;
    this.put({ ...device, pushSeq: seq }); // Durable before any encryption, including failed sends.
    return seq;
  }
  setPushPrefs(id: string, pushPrefs: MobilePushPrefs): void {
    const device = this.records.find(item => item.id === id);
    if (!device || !isMobilePushPrefs(pushPrefs)) throw Error("Invalid push preferences");
    this.put({ ...device, pushPrefs });
  }
  setPushToken(id: string, token: string | null): void {
    const previous = this.records.find(device => device.id === id);
    if (!previous || !mobilePushToken(token)) throw Error("Invalid mobile push token");
    this.put({ ...previous, pushToken: token });
  }
  setAllowWork(id: string, allowWork: boolean): void {
    const previous = this.records.find(device => device.id === id);
    if (!previous || typeof allowWork !== "boolean") throw Error("Invalid mobile work setting");
    this.put({ ...previous, allowWork });
  }
  audit(entry: MobileAudit): void {
    if (!mobileBase64url(entry.deviceId, 32) || !mobileText(entry.permissionId, 200)
      || !["allow", "deny"].includes(entry.result) || !mobileInteger(entry.time)) throw Error("Invalid mobile audit entry");
    const file = join(this.directory, "approvals.jsonl");
    const descriptor = openSync(file, "a", 0o600);
    try {
      chmodSync(file, 0o600);
      appendFileSync(descriptor, JSON.stringify({ deviceId: entry.deviceId, permissionId: entry.permissionId, result: entry.result, time: entry.time }) + "\n");
      fsyncSync(descriptor);
      const directory = openSync(this.directory, "r");
      try { fsyncSync(directory); } finally { closeSync(directory); }
    } finally { closeSync(descriptor); }
  }
  close(): void {
    if (this.closed) return;
    this.closed = true; rmSync(this.lock, { force: true });
  }
}
