import { mobileBase64url, mobileInteger, mobileObject, mobileText } from "./mobile-protocol";
import type { MobilePublicKeys } from "./mobile-signing";
import type { MobilePushKind } from "./mobile-push";

export type MobilePushPrefs = { permission: boolean; report: boolean; error: boolean; contentVersion: 0 | 1 };
export const MOBILE_PUSH_DEFAULTS: Readonly<MobilePushPrefs> = { permission: true, report: true, error: true, contentVersion: 0 };
export const MOBILE_PUSH_CONTENT_TTL = 3_600_000;
export const MOBILE_PUSH_PLAINTEXT_BYTES = 2400;
export function isMobilePushPrefs(value: unknown): value is MobilePushPrefs {
  return mobileObject(value, ["permission", "report", "error", "contentVersion"])
    && typeof value.permission === "boolean" && typeof value.report === "boolean" && typeof value.error === "boolean"
    && (value.contentVersion === 0 || value.contentVersion === 1);
}
export function mobilePushPrefsValues(value: MobilePushPrefs): unknown[] {
  return [value.permission, value.report, value.error, value.contentVersion];
}

export type MobilePushTarget = { type: "permission" | "report" | "hero"; id: string; questId: string | null };
export type MobilePushContent = {
  kind: MobilePushKind; heroName: string; town: string; summary: string; expiresAt: number; target: MobilePushTarget | null;
};
export type MobilePushEnvelope = MobilePushContent & { v: 1; deviceId: string; seq: number; timestamp: number };
export type MobileSignedPush = MobilePushEnvelope & { signature: string };
export type MobilePushPacket = { v: 1; kind: MobilePushKind; deviceId: string; seq: number; ciphertext: string };
const kind = (value: unknown): value is MobilePushKind => value === "permission" || value === "report" || value === "error";
const controls = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;
const label = (value: unknown, max: number): value is string => mobileText(value, max) && !controls.test(value);

// Notification previews are not permission content: one short, safe line, never a basis for approval.
export function mobilePushText(value: string, fallback: string): string {
  const line = value.replace(new RegExp(controls.source, "g"), " ");
  let text = line.slice(0, line.length > 80 ? 79 : 80);
  if (/[\ud800-\udbff]$/.test(text)) text = text.slice(0, -1);
  if (line.length > 80) text += "…";
  return label(text, 80) && text.trim() ? text : fallback;
}
export function isMobilePushContent(value: unknown): value is MobilePushContent {
  if (!mobileObject(value, ["kind", "heroName", "town", "summary", "expiresAt", "target"]) || !kind(value.kind)
    || !label(value.heroName, 80) || !label(value.town, 80) || !label(value.summary, 80) || !mobileInteger(value.expiresAt)) return false;
  const target = value.target;
  return target === null || mobileObject(target, ["type", "id", "questId"]) && label(target.id, 200)
    && (value.kind === "permission" && target.type === "permission" && target.questId === null
      || value.kind === "error" && target.type === "hero" && target.questId === null
      || value.kind === "report" && target.type === "report" && label(target.questId, 200));
}
export function parseMobilePushPacket(value: unknown): MobilePushPacket | undefined {
  if (!mobileObject(value, ["v", "kind", "deviceId", "seq", "ciphertext"]) || value.v !== 1 || !kind(value.kind)
    || !mobileBase64url(value.deviceId, 32) || !mobileInteger(value.seq, 1) || !mobileBase64url(value.ciphertext)
    || value.ciphertext.length < 22 || value.ciphertext.length > Math.ceil((MOBILE_PUSH_PLAINTEXT_BYTES + 16) * 8 / 6)) return;
  return value as MobilePushPacket;
}
export function parseMobilePushEnvelope(value: unknown): MobileSignedPush | undefined {
  if (!mobileObject(value, ["v", "deviceId", "seq", "timestamp", "kind", "heroName", "town", "summary", "expiresAt", "target", "signature"])
    || value.v !== 1 || !mobileBase64url(value.deviceId, 32) || !mobileInteger(value.seq, 1)
    || !mobileInteger(value.timestamp) || !mobileBase64url(value.signature, 64)) return;
  const { v: _, deviceId: _id, seq: _seq, timestamp: _time, signature: _sig, ...content } = value;
  if (isMobilePushContent(content)) return value as MobileSignedPush;
}
// lastAccepted is the watermark for this registration AND kind; other kinds may arrive out of order.
export function mobilePushFresh(value: MobilePushEnvelope, lastAccepted: number, now: number): boolean {
  const lifetime = value.kind === "permission" ? 120000 : MOBILE_PUSH_CONTENT_TTL;
  return mobileInteger(lastAccepted) && mobileInteger(now) && value.seq > lastAccepted
    && value.timestamp <= now + 60000 && value.expiresAt > value.timestamp
    && value.expiresAt - value.timestamp <= lifetime && now < value.expiresAt;
}
export function mobilePushSigningInput(value: MobilePushEnvelope): Uint8Array {
  const t = value.target;
  return new TextEncoder().encode(JSON.stringify(["yushario.push.v1", 1, value.deviceId, value.seq, value.timestamp,
    value.kind, value.heroName, value.town, value.summary, value.expiresAt, t === null ? null : [t.type, t.id, t.questId]]));
}
export function mobilePushAad(packet: Pick<MobilePushPacket, "deviceId" | "seq" | "kind">, keys: MobilePublicKeys): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(["yushario.push.aead.v1", 1, packet.deviceId, packet.seq, packet.kind,
    keys.gatewayEncryptionKey, keys.gatewaySigningKey, keys.phoneEncryptionKey, keys.phoneSigningKey]));
}
