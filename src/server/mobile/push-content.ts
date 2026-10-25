import type { MobileHero } from "../../core/mobile-display";
import type { Permission } from "../../core/permissions";
import { isMobilePushContent, mobilePushAad, mobilePushFresh, mobilePushSigningInput, mobilePushText,
  MOBILE_PUSH_PLAINTEXT_BYTES, type MobilePushContent, type MobilePushPacket } from "../../core/mobile-push-content";
import { mobileNonce } from "../../core/mobile-signing";
import { deriveMobileKeys, mobileEncrypt, mobileKeys, mobileSign } from "./crypto";
import type { MobileDevice, MobileStore } from "./store";

export function permissionPushContent(permission: Permission, hero?: MobileHero): MobilePushContent {
  return { kind: "permission", heroName: mobilePushText(hero?.name ?? "", "勇者"), town: mobilePushText(hero?.town ?? "", "町"),
    summary: mobilePushText(`${permission.tool}: ${permission.content}`, "許可の確認"), expiresAt: permission.expiresAt,
    target: { type: "permission", id: permission.id, questId: null } };
}

export function sealMobilePush(content: MobilePushContent, store: MobileStore, device: MobileDevice, now: number): MobilePushPacket {
  if (!isMobilePushContent(content)) throw Error("Invalid push content");
  // This counter has its own HKDF key and is never tied to HTTP request/reply sequence numbers.
  const seq = store.reservePush(device.id);
  const envelope = { v: 1 as const, deviceId: device.id, seq, timestamp: now, ...content };
  if (!mobilePushFresh(envelope, 0, now)) throw Error("Expired push content");
  const signature = mobileSign(mobilePushSigningInput(envelope), store.identity.signingPrivateKey);
  const plaintext = Buffer.from(JSON.stringify({ ...envelope, signature }));
  if (plaintext.length > MOBILE_PUSH_PLAINTEXT_BYTES) throw Error("Push content too large");
  const keys = mobileKeys(store.identity, device.phoneEncryptionKey, device.phoneSigningKey);
  const { pushKey } = deriveMobileKeys(store.identity, device.phoneEncryptionKey, device.phoneSigningKey, device.id);
  const packet = { v: 1 as const, kind: content.kind, deviceId: device.id, seq };
  const ciphertext = mobileEncrypt(plaintext, pushKey, mobileNonce(seq), mobilePushAad(packet, keys)).toString("base64url");
  return { ...packet, ciphertext };
}
