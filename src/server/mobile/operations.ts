import { mobilePermissionHashInput, type MobileHero, type MobilePermission, type MobileResponseBody } from "../../core/mobile-display";
import { mobileText, type MobileSignedRequest } from "../../core/mobile-protocol";
import type { PermissionWaiter } from "../permissions";
import { mobileEqual, mobileHash } from "./crypto";
import type { MobileStore } from "./store";

export function mobileShort(value: string, max: number, fallback = ""): string {
  let text = value.slice(0, max);
  if (/[\ud800-\udbff]$/.test(text)) text = text.slice(0, -1);
  return mobileText(text, max, true) ? text || fallback : fallback;
}
export function mobilePermissionViews(permissions: PermissionWaiter, heroes: MobileHero[]): MobilePermission[] {
  return permissions.pending.filter(permission => permission.expiresAt > Date.now() && mobileText(permission.content, 2000, true)
    && mobileText(permission.id, 200) && mobileText(permission.tool, 200)).map(permission => {
    const hero = heroes.find(hero => hero.id === permission.agent || hero.id === permission.terminal);
    const value = { id: permission.id, heroId: permission.agent ?? permission.terminal,
      heroName: hero?.name ?? mobileShort(permission.name ?? "", 200, "勇者"), town: hero?.town ?? "町",
      tool: permission.tool, summary: mobileShort(permission.summary, 200, permission.tool), content: permission.content,
      omitted: permission.omitted, expiresAt: permission.expiresAt };
    return { ...value, contentHash: mobileHash(mobilePermissionHashInput(value)).toString("base64url") };
  }).sort((a, b) => a.expiresAt - b.expiresAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, 16);
}

export function mobileOperation(request: MobileSignedRequest, store: MobileStore, permissions: PermissionWaiter,
  heroes: MobileHero[], reports: import("../../core/mobile-display").MobileReport[]): MobileResponseBody {
  switch (request.operation) {
    case "status": {
      const waiting = new Set(permissions.pending.filter(permission => permission.expiresAt > Date.now()).map(permission => permission.agent ?? permission.terminal));
      return { operation: "status", body: { heroes: heroes.map(hero => ({ ...hero, permissionPending: waiting.has(hero.id) }))
        .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).slice(0, 100) } };
    }
    case "permissions": return { operation: "permissions", body: { permissions: mobilePermissionViews(permissions, heroes) } };
    case "reports": return { operation: "reports", body: { reports: [...reports]
      .sort((a, b) => b.at - a.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, 50) } };
    case "decide": {
      const displayed = mobilePermissionViews(permissions, heroes).find(permission => permission.id === request.body.permissionId);
      if (!displayed || !mobileEqual(displayed.contentHash, request.body.contentHash)
        || request.body.decision === "allow" && displayed.omitted !== 0) throw Error("Permission rejected");
      if (!permissions.decide(request.body.permissionId, request.body.decision, () => store.audit({ deviceId: request.deviceId,
        permissionId: request.body.permissionId, result: request.body.decision, time: Date.now() }))) throw Error("Permission rejected");
      return { operation: "decide", body: { decided: true } };
    }
    case "push-token": store.setPushToken(request.deviceId, request.body.token); return { operation: "push-token", body: { updated: true } };
    case "unpair": return { operation: "unpair", body: { unpaired: true } };
    case "pair": throw Error("Pairing rejected");
  }
}
