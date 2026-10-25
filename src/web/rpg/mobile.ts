import qrcode from "qrcode-generator";
import { tr } from "../language";
import { loadMobile, startPairing, confirmPairing, cancelPairing, revokeDevice, testPush, type MobileState } from "./mobile-api";
import { mobilePushOutcome, type MobilePushLogEntry } from "../../core/mobile-push";
import "./mobile.css";

function lastPushLabel(entry?: MobilePushLogEntry): string {
  const outcome = entry ? mobilePushOutcome(entry) : "unconfirmed";
  const result = outcome === "delivered" ? tr("配送済み（FCM/APNs 受理）", "Sent (accepted by FCM/APNs)")
    : outcome === "no-token" ? tr("通知 ID なし", "No push token")
      : outcome === "failed" ? tr(`失敗（${entry?.errorCode ?? "UnknownExpoError"}）`, `Failed (${entry?.errorCode ?? "UnknownExpoError"})`)
        : tr(`未確認${entry?.errorCode ? `（${entry.errorCode}）` : ""}`, `Unconfirmed${entry?.errorCode ? ` (${entry.errorCode})` : ""}`);
  return tr(`最後の通知: ${result}`, `Last push: ${result}`) + (entry ? ` · ${new Date(entry.time).toLocaleString()}` : "");
}

export function initMobile(): void {
  const get = <T extends HTMLElement>(id: string) => document.getElementById(`mobile-${id}`) as T;
  const entry = document.getElementById("mobile") as HTMLButtonElement;
  const dialog = get<HTMLDialogElement>("dialog"), status = get("status");
  const addresses = get<HTMLTextAreaElement>("addresses"), pairingText = get<HTMLInputElement>("string");
  const qrCanvas = get<HTMLCanvasElement>("qr"), devices = get("devices");
  let current: MobileState = { enabled: false }, busy = false, timer: ReturnType<typeof setInterval> | undefined;
  let shownQr = "", addressEdited = false;
  const rows = new Map<string, { row: HTMLElement; name: HTMLElement; seen: HTMLElement; push: HTMLElement; test: HTMLButtonElement }>();
  addresses.addEventListener("input", () => { addressEdited = true; });
  function error(cause: unknown): void { status.textContent = cause instanceof Error ? cause.message : tr("読み込めなかった。", "Could not load."); }
  function render(state: MobileState): void {
    current = state; entry.hidden = !state.enabled;
    if (!state.enabled) { if (dialog.open) dialog.close(); return; }
    if (!addressEdited) addresses.value = state.addresses.join("\n");
    const pairing = state.pairing, available = pairing?.status === "available", pending = pairing?.status === "pending";
    get("start").hidden = !!available || !!pending;
    get<HTMLButtonElement>("pair").disabled = busy || state.devices.length >= 5;
    get("offer").hidden = !available; get("confirm").hidden = !pending;
    get("offer-actions").hidden = !available;
    get("countdown").hidden = !available && !pending;
    get("countdown").textContent = pairing ? tr(`あと ${Math.max(0, Math.ceil((pairing.expiresAt - Date.now()) / 1000))} 秒`, `${Math.max(0, Math.ceil((pairing.expiresAt - Date.now()) / 1000))} seconds left`) : "";
    get("sas").textContent = pairing?.sas ?? ""; get("device-name").textContent = pairing?.name ?? "";
    pairingText.value = available ? pairing?.pairingString ?? "" : "";
    if (pairingText.value && shownQr !== pairingText.value) {
      const qr = qrcode(0, "M"); qr.addData(pairingText.value, "Byte"); qr.make();
      const count = qr.getModuleCount(), scale = 4;
      qrCanvas.width = qrCanvas.height = (count + 8) * scale;
      const context = qrCanvas.getContext("2d")!;
      context.fillStyle = "#fff"; context.fillRect(0, 0, qrCanvas.width, qrCanvas.height);
      context.fillStyle = "#000";
      for (let y = 0; y < count; y++) for (let x = 0; x < count; x++) {
        if (qr.isDark(y, x)) context.fillRect((x + 4) * scale, (y + 4) * scale, scale, scale);
      }
      shownQr = pairingText.value;
    }
    const results = new Map((state.pushResults ?? []).map(result => [result.deviceId, result]));
    const ids = new Set(state.devices.map(device => device.id));
    for (const [id, item] of rows) if (!ids.has(id)) { item.row.remove(); rows.delete(id); }
    for (const device of state.devices) {
      let item = rows.get(device.id);
      if (!item) {
        const row = document.createElement("div"), name = document.createElement("strong"), seen = document.createElement("span"), revoke = document.createElement("button");
        const push = document.createElement("span"), test = document.createElement("button");
        test.type = "button"; test.className = "mobile-push-test"; test.textContent = tr("テスト通知を送る", "Send test push");
        test.addEventListener("click", () => void mutate(() => testPush(device.id)));
        row.className = "mobile-device"; revoke.type = "button"; revoke.textContent = tr("取り消す", "Revoke");
        revoke.addEventListener("click", () => {
          if (confirm(tr(`${device.name} の登録を 取り消す？`, `Revoke ${device.name}?`))) void mutate(() => revokeDevice(device.id));
        });
        row.append(name, seen, push, revoke, test); devices.append(row); item = { row, name, seen, push, test }; rows.set(device.id, item);
      }
      item.name.textContent = device.name; item.seen.textContent = tr(`最後の接続 ${new Date(device.lastSeenAt).toLocaleString()}`, `Last seen ${new Date(device.lastSeenAt).toLocaleString()}`);
      item.push.textContent = lastPushLabel(results.get(device.id)); item.test.disabled = busy || state.pushResults === undefined;
    }
    get("emulator").hidden = !state.addresses.some(address => address.includes("127.0.0.1"));
    get("emulator").textContent = tr("Android エミュレーターでは 127.0.0.1 を 10.0.2.2 に かえてから登録しよう。", "For the Android emulator, replace 127.0.0.1 with 10.0.2.2 before pairing.");
    if (!busy) status.textContent = state.pushResults === undefined ? tr("通知の診断にはサーバーを再起動してください。", "Restart the server to enable push diagnostics.") : state.devices.length >= 5 ? tr("登録は5台まで。不要な端末を取り消そう。", "Five-device limit. Revoke an unused phone.")
      : pairing?.status === "expired" ? tr("期限が切れた。もう一度 登録しよう。", "Expired. Start pairing again.")
        : pairing?.status === "locked" ? tr("失敗が3回あった。新しく 登録しよう。", "Three failed attempts. Start pairing again.") : "";
  }
  async function mutate(action: () => Promise<MobileState>): Promise<void> {
    if (busy) return;
    busy = true;
    for (const button of dialog.querySelectorAll<HTMLButtonElement>("button:not(#mobile-close)")) button.disabled = true;
    try { render(await action()); } catch (cause) { error(cause); }
    finally {
      busy = false;
      for (const button of dialog.querySelectorAll<HTMLButtonElement>("button")) button.disabled = false;
      if (current.enabled) get<HTMLButtonElement>("pair").disabled = current.devices.length >= 5;
      for (const item of rows.values()) item.test.disabled = !current.enabled || current.pushResults === undefined;
    }
  }
  async function poll(): Promise<void> {
    if (busy || !dialog.open) return;
    try { const value = await loadMobile(); if (dialog.open && !busy) render(value); } catch (cause) { error(cause); }
  }
  entry.addEventListener("click", () => {
    addressEdited = false; render(current); dialog.showModal(); void poll();
    clearInterval(timer); timer = setInterval(() => void poll(), 1000);
  });
  dialog.addEventListener("close", () => {
    clearInterval(timer); timer = undefined;
    // Codes are not persisted in DOM while the registration window is closed.
    pairingText.value = ""; shownQr = ""; qrCanvas.width = qrCanvas.height = 0;
  });
  get("close").addEventListener("click", () => dialog.close());
  get("pair").addEventListener("click", () => void mutate(() => startPairing(addresses.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean))));
  get("cancel").addEventListener("click", () => void mutate(cancelPairing));
  for (const [id, approve] of [["approve", true], ["reject", false]] as const) {
    get(id).addEventListener("click", () => {
      const deviceId = current.enabled ? current.pairing?.deviceId : null;
      if (deviceId) void mutate(() => confirmPairing(deviceId, approve));
    });
  }
  get("copy").addEventListener("click", () => {
    void Promise.resolve().then(() => navigator.clipboard.writeText(pairingText.value)).then(() => { status.textContent = tr("コピーした。", "Copied."); })
      .catch(() => { pairingText.select(); status.textContent = tr("文字を選んだ。手動でコピーしよう。", "Text selected. Copy it manually."); });
  });
  void loadMobile().then(render).catch(() => { entry.hidden = true; });
}
