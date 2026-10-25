import { tr } from "../language";
import type { MobilePushLogEntry } from "../../core/mobile-push";

export type MobileDevice = { id: string; name: string; createdAt: number; lastSeenAt: number; allowWork: boolean };
export type MobileWorkNotice = { deviceId: string; operation: string; questId: string; heroId: string | null; time: number };
export type MobilePairing = {
  status: "available" | "pending" | "consumed" | "expired" | "locked";
  expiresAt: number;
  pairingString: string | null;
  sas: string | null;
  name: string | null;
  deviceId: string | null;
};
export type MobileState = { enabled: false } | { enabled: true; addresses: string[]; devices: MobileDevice[]; pairing: MobilePairing | null; pushResults?: MobilePushLogEntry[]; workNotices?: MobileWorkNotice[] };

const token = new URLSearchParams(location.search).get("token") ?? "";

async function request(path: string, method = "GET", body?: object): Promise<MobileState> {
  const response = await fetch(`/api/mobile${path}?${new URLSearchParams({ token })}`, {
    method, cache: "no-store",
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(tr(`スマホの窓口に つながらなかった（${response.status}）`, `Could not reach the phone gateway (${response.status})`));
  return response.json() as Promise<MobileState>;
}

export const loadMobile = () => request("");
export const startPairing = (addresses: string[]) => request("/pair", "POST", { addresses });
export const confirmPairing = (deviceId: string, approve: boolean, allowWork = false) => request("/confirm", "POST", { deviceId, approve, allowWork });
export const cancelPairing = () => request("/cancel", "POST", {});
export const revokeDevice = (id: string) => request(`/devices/${encodeURIComponent(id)}`, "DELETE");
export const setDeviceWork = (id: string, enabled: boolean) => request(`/devices/${encodeURIComponent(id)}/work`, "POST", { enabled });
export const testPush = (deviceId: string) => request("/test-push", "POST", { deviceId });
