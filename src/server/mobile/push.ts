import { mobilePushPayload } from "../../core/mobile-pairing";
import type { MobileStore } from "./store";

export async function sendMobilePush(store: MobileStore, kind: "permission" | "report" | "error"): Promise<void> {
  await Promise.all(store.devices.filter(device => device.pushToken).map(async device => {
    const token = device.pushToken!;
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: token, ...mobilePushPayload(kind) }), signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw Error("Push rejected");
      const value = await response.json() as { data?: { status?: string; details?: { error?: string } } };
      if (value.data?.details?.error === "DeviceNotRegistered") {
        if (store.devices.find(item => item.id === device.id)?.pushToken === token) store.setPushToken(device.id, null);
      } else if (value.data?.status !== "ok") throw Error("Push rejected");
    } catch { console.warn("Mobile push failed; ignored / スマホへの通知に失敗（無視）"); }
  }));
}
