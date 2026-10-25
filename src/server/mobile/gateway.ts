import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import type { MobileHero, MobileResponse } from "../../core/mobile-display";
import { mobileInteger, mobileReplayAllowed, parseMobilePacket } from "../../core/mobile-protocol";
import { mobileBindSharesMainPort } from "../../core/startup";
import type { PermissionWaiter, Permission } from "../permissions";
import type { AgentEvent } from "../../core/events";
import { MOBILE_PUSH_CONTENT_TTL, mobilePushText } from "../../core/mobile-push-content";
import { permissionPushContent } from "./push-content";
import { openMobileRequest, sealMobileResponse } from "./crypto";
import { MobileStore } from "./store";
import { MobilePairing } from "./pairing";
import { MobileRateLimit, mobileJson, mobileRejected, readMobileJson } from "./http";
import { mobileOperation, mobilePermissionViews } from "./operations";
import { MobilePush } from "./push";
import type { MobileQuests } from "./quests";
import type { MobileWork } from "./work";
import { mobileWorkNotices } from "./work-audit";

export class MobileGateway {
  readonly store: MobileStore;
  readonly pairing: MobilePairing;
  private readonly push: MobilePush;
  heroes: MobileHero[] = [];
  work?: MobileWork;
  addresses: string[] = [];
  reservedMainPort?: number;
  private readonly rate = new MobileRateLimit();
  private readonly server = createServer((request, response) => { void this.handle(request, response); });
  constructor(directory: string, private readonly permissions: PermissionWaiter, private readonly quests?: MobileQuests) {
    this.store = new MobileStore(directory); this.pairing = new MobilePairing(this.store); this.push = new MobilePush(this.store);
    this.server.headersTimeout = 10_000; this.server.requestTimeout = 15_000;
    this.server.on("upgrade", (_request, socket) => socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: 20\r\n\r\n{\"error\":\"rejected\"}"));
    this.server.on("clientError", (_error, socket) => {
      if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: 20\r\n\r\n{\"error\":\"rejected\"}");
    });
  }
  async listen(host: string, port: number): Promise<void> {
    if (host === "0.0.0.0" || host === "::") console.warn("WARNING: Mobile gateway listens on ALL interfaces / 警告：スマホ窓口を全アドレスで公開します。LAN/Tailscale 以外へ公開しないでください。");
    try {
      await new Promise<void>((resolve, reject) => {
        const error = (error: Error): void => { this.server.off("listening", ready); reject(error); };
        const ready = (): void => { this.server.off("error", error); resolve(); };
        this.server.once("error", error); this.server.once("listening", ready); this.server.listen(port, host);
      });
      const address = this.server.address();
      if (!address || typeof address === "string") throw Error("Mobile listener unavailable");
      this.reservedMainPort = mobileBindSharesMainPort(address.address) ? address.port : undefined;
      const hosts = host === "0.0.0.0" || host === "::" ? Object.values(networkInterfaces()).flat()
        .filter(item => item && !item.internal && !item.address.includes("%"))
        .map(item => item!.address).slice(0, 8) : [host];
      this.addresses = (hosts.length ? hosts : ["127.0.0.1"]).map(host => `http://${host.includes(":") ? `[${host}]` : host}:${address.port}`);
    } catch (cause) {
      this.store.close();
      const address = `${host.includes(":") ? `[${host}]` : host}:${port}`;
      const occupied = (cause as NodeJS.ErrnoException).code === "EADDRINUSE";
      throw new Error(occupied
        ? `Mobile gateway ${address} is already in use; choose another --mobile host:port. / スマホ窓口 ${address} は使用中です。--mobile のポートを変えてください。`
        : `Cannot bind mobile gateway ${address}; check --mobile host:port. / スマホ窓口 ${address} を開けません。--mobile のアドレスとポートを確認してください。`, { cause });
    }
    this.server.on("error", () => console.error("Mobile listener error / スマホ窓口でエラー"));
  }
  startPairing(addresses = this.addresses) { this.pairing.start(addresses); return this.snapshot(); }
  confirm(deviceId: string, approve: boolean, allowWork = false): boolean { return this.pairing.confirm(deviceId, approve, allowWork); }
  cancelPairing(): void { this.pairing.cancel(); }
  permissionViews() { return mobilePermissionViews(this.permissions, this.heroes); }
  snapshot() {
    return { enabled: true as const, addresses: this.addresses,
      devices: this.store.devices.map(({ id, name, createdAt, lastSeenAt, allowWork }) => ({ id, name, createdAt, lastSeenAt, allowWork })),
      pairing: this.pairing.snapshot(), pushResults: this.push.results(), workNotices: mobileWorkNotices(this.store.directory) };
  }
  notify(kind: "permission" | "report" | "error", expiresAt?: number): void { this.push.notify(kind, undefined, expiresAt); }
  notifyPermission(permission: Permission): void {
    const hero = this.heroes.find(hero => hero.id === permission.agent || hero.id === permission.terminal);
    this.push.notify("permission", undefined, permission.expiresAt, permissionPushContent(permission, hero));
  }
  notifyEvent(event: AgentEvent, at: number): void {
    const kind = event.hook === "Stop" && !event.subagent ? "report" : "error";
    const hero = this.heroes.find(hero => hero.id === event.agent);
    const report = kind === "report" && event.agent ? this.quests?.reportNotification(event.agent, at) : undefined;
    this.push.notify(kind, undefined, undefined, { kind, heroName: mobilePushText(hero?.name ?? "", "勇者"),
      town: mobilePushText(report?.town ?? hero?.town ?? "", "町"),
      summary: mobilePushText(kind === "error" ? "止まりました" : report?.title ?? "返事が届いた", "返事が届いた"),
      expiresAt: Date.now() + MOBILE_PUSH_CONTENT_TTL,
      target: kind === "error" && hero ? { type: "hero", id: hero.id, questId: null } : report?.target ?? null });
  }
  testPush(deviceId: string): boolean {
    if (!this.store.devices.some(device => device.id === deviceId)) return false;
    this.push.notify("permission", deviceId); return true;
  }
  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    let pairCandidate = false;
    try {
      if (request.url !== "/mobile/v1" || request.method !== "POST" || request.headers.origin !== undefined
        || request.headers["content-encoding"] !== undefined || !["application/json", "application/json; charset=utf-8"].includes(request.headers["content-type"] ?? "")
        || !this.rate.allow(`ip:${request.socket.remoteAddress ?? "unknown"}`)) throw Error("Invalid mobile transport");
      pairCandidate = true;
      const input = await readMobileJson(request);
      if (input && typeof input === "object" && mobileInteger((input as { v?: unknown }).v) && (input as { v: number }).v !== 1) {
        mobileJson(response, { error: "version", supportedVersion: 1 }, 426); return;
      }
      const packet = parseMobilePacket(input);
      if (!packet) throw Error("Invalid mobile packet");
      const device = this.store.devices.find(device => device.id === packet.deviceId);
      pairCandidate = !device;
      if (device) {
        if (device.phoneEncryptionKey !== packet.phoneEncryptionKey || device.phoneSigningKey !== packet.phoneSigningKey
          || !this.rate.allow(`device:${device.id}`)) throw Error("Invalid mobile device");
      } else if (!this.pairing.available()) throw Error("Pairing unavailable");
      const envelope = openMobileRequest(packet, this.store.identity);
      let result: MobileResponse;
      if (!device) {
        const pending = this.pairing.request(envelope, packet);
        const disconnected = (): void => this.pairing.cancel(packet.deviceId);
        response.once("close", disconnected);
        const approved = await pending;
        response.off("close", disconnected);
        if (!approved || response.destroyed) throw Error("Pairing rejected");
        result = { v: 1, deviceId: envelope.deviceId, seq: envelope.seq, timestamp: Date.now(), operation: "pair", body: { registered: true } };
      } else {
        if (envelope.operation === "pair" || !mobileReplayAllowed(envelope.seq, envelope.timestamp, device.lastSeq, Date.now())) throw Error("Invalid mobile replay");
        this.store.advance(device.id, envelope.seq, Date.now()); // Durable before effects and before response encryption.
        const operation = await mobileOperation(envelope, this.store, this.permissions, this.heroes, this.quests, this.work);
        result = { v: 1, deviceId: envelope.deviceId, seq: envelope.seq, timestamp: Date.now(), ...operation };
      }
      const encrypted = sealMobileResponse(result, this.store.identity, packet.phoneEncryptionKey, packet.phoneSigningKey);
      if (envelope.operation === "unpair") this.store.remove(envelope.deviceId);
      mobileJson(response, encrypted);
    } catch {
      if (pairCandidate) this.pairing.failed();
      mobileRejected(response);
    }
  }
  async close(): Promise<void> {
    this.cancelPairing(); this.push.close();
    await new Promise<void>(resolve => { this.server.close(() => resolve()); this.server.closeAllConnections(); });
    this.store.close();
  }
}
