import { randomBytes } from "node:crypto";
import { mobilePairingState, mobilePairingTransition, parseMobilePairingOffer,
  type MobilePairingOffer, type MobilePairingState } from "../../core/mobile-pairing";
import { mobileReplayAllowed, type MobilePacket, type MobileSignedRequest } from "../../core/mobile-protocol";
import { mobileDeviceId, mobileEqual, mobileSas } from "./crypto";
import type { MobileStore } from "./store";

type Pending = { request: MobileSignedRequest & { operation: "pair" }; packet: MobilePacket; resolve: (approved: boolean) => void };

export class MobilePairing {
  private offer?: MobilePairingOffer;
  private state?: MobilePairingState;
  private pending?: Pending;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private readonly store: MobileStore) {}

  start(addresses: string[]): void {
    if (this.store.devices.length >= 5) throw Error("Pairing unavailable");
    const state = mobilePairingState(Date.now());
    const offer: MobilePairingOffer = { v: 1, addresses, gatewayEncryptionKey: this.store.identity.encryptionPublicKey,
      gatewaySigningKey: this.store.identity.signingPublicKey, pairingCode: randomBytes(16).toString("base64url"), expiresAt: state.expiresAt };
    if (!parseMobilePairingOffer(offer, Date.now())) throw Error("Invalid mobile addresses");
    this.cancel(); this.offer = offer; this.state = state;
    this.timer = setTimeout(() => this.expire(), Math.max(0, state.expiresAt - Date.now())).unref();
  }
  private expire(): void {
    if (!this.state || Date.now() < this.state.expiresAt) return;
    this.state = mobilePairingTransition(this.state, { type: "fail" }, Date.now(), this.store.devices.length).state;
    if (this.state.status === "expired") this.settle(false);
  }
  available(): boolean { this.expire(); return this.state?.status === "available"; }
  failed(): void {
    this.expire();
    if (this.state) this.state = mobilePairingTransition(this.state, { type: "fail" }, Date.now(), this.store.devices.length).state;
  }
  request(request: MobileSignedRequest, packet: MobilePacket): Promise<boolean> {
    if (!this.available() || !this.offer || !this.state || request.operation !== "pair"
      || !mobileReplayAllowed(request.seq, request.timestamp, 0, Date.now())
      || !mobileEqual(request.body.pairingCode, this.offer.pairingCode)
      || !mobileEqual(request.deviceId, mobileDeviceId(packet.phoneEncryptionKey, packet.phoneSigningKey, this.offer.pairingCode))) throw Error("Pairing rejected");
    this.state = mobilePairingTransition(this.state, { type: "reserve", deviceId: request.deviceId }, Date.now(), this.store.devices.length).state;
    if (this.state.status !== "pending") throw Error("Pairing rejected");
    return new Promise(resolve => { this.pending = { request: request as Pending["request"], packet, resolve }; });
  }
  confirm(deviceId: string, approve: boolean, allowWork = false): boolean {
    this.expire();
    if (typeof allowWork !== "boolean") return false;
    if (!this.state || this.state.status !== "pending" || !this.pending || this.pending.request.deviceId !== deviceId) return false;
    const pending = this.pending;
    const transition = mobilePairingTransition(this.state, { type: approve ? "confirm" : "reject" }, Date.now(), this.store.devices.length);
    this.state = transition.state;
    try {
      if (transition.register) {
        const now = Date.now(), { request, packet } = pending;
        this.store.put({ id: request.deviceId, phoneEncryptionKey: packet.phoneEncryptionKey, phoneSigningKey: packet.phoneSigningKey,
          name: request.body.name, pushToken: request.body.pushToken, lastSeq: request.seq, createdAt: now, lastSeenAt: now, allowWork });
      }
      this.settle(transition.register); return true;
    } catch (error) { this.settle(false); throw error; }
  }
  private settle(approved: boolean): void {
    const pending = this.pending; this.pending = undefined;
    clearTimeout(this.timer); this.timer = undefined;
    pending?.resolve(approved);
  }
  cancel(deviceId?: string): void {
    if (deviceId !== undefined && this.pending?.request.deviceId !== deviceId) return;
    if (this.state?.status === "available" || this.state?.status === "pending") this.state = { ...this.state, status: "consumed" };
    this.settle(false);
  }
  snapshot() {
    this.expire();
    if (!this.state || !this.offer) return null;
    const available = this.state.status === "available", pending = this.state.status === "pending" ? this.pending : undefined;
    return { status: this.state.status, expiresAt: this.state.expiresAt,
      pairingString: available ? `yushario-pair:1:${Buffer.from(JSON.stringify(this.offer)).toString("base64url")}` : null,
      sas: pending ? mobileSas(this.store.identity, pending.packet.phoneEncryptionKey, pending.packet.phoneSigningKey, this.offer.pairingCode) : null,
      name: pending?.request.body.name ?? null, deviceId: pending?.request.deviceId ?? null };
  }
}
