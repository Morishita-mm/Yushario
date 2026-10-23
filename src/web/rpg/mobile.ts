import qrcode from "qrcode-generator";
import { tr } from "../language";
import { loadMobile, startPairing, confirmPairing, cancelPairing, revokeDevice, setDeviceWork, testPush, type MobileState,
  type MobileWorkNotice }  from "./mobile-api";
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

// Audited attempts, not proof of delivery. Never display IDs or request bodies.
const WORK_LABELS: Record<string, [string, string]> = {
  send: ["依頼の送信を試みた", "Request delivery attempted"], spawn: ["勇者の出陣を試みた", "Hero launch attempted"],
  setoff: ["パーティーの出発を試みた", "Party departure attempted"],
  prepare: ["札の作成・担当付け", "Card creation / assignment"], form: ["編成の保存・権限変更", "Party form / role changes"],
};
const SEEN_KEY = "yushario.mobileWorkSeen";
function seenAt(): number { try { return Number(localStorage.getItem(SEEN_KEY)) || 0; } catch { return 0; } }
function markSeen(time: number): void { try { localStorage.setItem(SEEN_KEY, String(time)); } catch { /* The badge just reappears next load. */ } }

export function initMobile(): void {
  const get = <T extends HTMLElement>(id: string) => document.getElementById(`mobile-${id}`) as T;
  const entry = document.getElementById("mobile") as HTMLButtonElement;
  const dialog = get<HTMLDialogElement>("dialog"), status = get("status");
  const addresses = get<HTMLTextAreaElement>("addresses"), pairingText = get<HTMLInputElement>("string");
  const qrCanvas = get<HTMLCanvasElement>("qr"), devices = get("devices");
  let current: MobileState = { enabled: false }, busy = false, timer: ReturnType<typeof setInterval> | undefined;
  let shownQr = "", addressEdited = false, shownNotices = "", version = 0;
  const rows = new Map<string, { row: HTMLElement; name: HTMLElement; seen: HTMLElement; push: HTMLElement; test: HTMLButtonElement; work: HTMLInputElement }>();
  const notices = document.createElement("section"), noticeTitle = document.createElement("h4"), noticeList = document.createElement("ul");
  noticeTitle.textContent = tr("スマホからの依頼・出陣の記録", "Requests and setoff from phones");
  noticeList.className = "mobile-notices"; notices.append(noticeTitle, noticeList); devices.after(notices);
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
        const label = document.createElement("label"), work = document.createElement("input"), caution = document.createElement("span");
        label.className = "mobile-work"; work.type = "checkbox";
        label.append(work, tr("スマホからの依頼・出陣を許可", "Allow requests and setoff from this phone"));
        caution.className = "mobile-work-caution";
        caution.textContent = tr("オンにすると、このスマホの操作で勇者が動き、Mac でコマンドが実行されることがある。札の発行と報告の閲覧はオフでも使える。",
          "When on, this phone can move heroes, which may run commands on this Mac. Issuing cards and reading reports work either way.");
        work.addEventListener("change", () => {
          const enabled = work.checked;
          if (enabled && !confirm(tr(`${device.name} からの依頼・出陣を許可する？\nスマホの操作で Mac のコマンドが動くことがある。`,
            `Allow requests and setoff from ${device.name}?\nPhone actions may run commands on this Mac.`))) { work.checked = false; return; }
          void mutate(() => setDeviceWork(device.id, enabled));
        });
        row.append(name, seen, push, revoke, test, label, caution); devices.append(row); item = { row, name, seen, push, test, work }; rows.set(device.id, item);
      }
      item.name.textContent = device.name; item.seen.textContent = tr(`最後の接続 ${new Date(device.lastSeenAt).toLocaleString()}`, `Last seen ${new Date(device.lastSeenAt).toLocaleString()}`);
      item.push.textContent = lastPushLabel(results.get(device.id)); item.test.disabled = busy || state.pushResults === undefined;
      item.work.checked = device.allowWork === true; item.work.disabled = busy;
    }
    renderNotices(state.workNotices ?? [], new Map(state.devices.map(device => [device.id, device.name])));
    get("emulator").hidden = !state.addresses.some(address => address.includes("127.0.0.1"));
    get("emulator").textContent = tr("Android エミュレーターでは 127.0.0.1 を 10.0.2.2 に かえてから登録しよう。", "For the Android emulator, replace 127.0.0.1 with 10.0.2.2 before pairing.");
    if (!busy) status.textContent = state.pushResults === undefined ? tr("通知の診断にはサーバーを再起動してください。", "Restart the server to enable push diagnostics.") : state.devices.length >= 5 ? tr("登録は5台まで。不要な端末を取り消そう。", "Five-device limit. Revoke an unused phone.")
      : pairing?.status === "expired" ? tr("期限が切れた。もう一度 登録しよう。", "Expired. Start pairing again.")
        : pairing?.status === "locked" ? tr("失敗が3回あった。新しく 登録しよう。", "Three failed attempts. Start pairing again.") : "";
  }
  function renderNotices(list: MobileWorkNotice[], names: Map<string, string>): void {
    const shown = list.filter(notice => Object.hasOwn(WORK_LABELS, notice.operation) && Number.isFinite(notice.time))
      .slice(-50).sort((a, b) => b.time - a.time);
    const lines = shown.map(notice => `${new Date(notice.time).toLocaleString()} · ${names.get(notice.deviceId) ?? tr("取り消した端末", "Revoked phone")} · ${tr(...WORK_LABELS[notice.operation])}`);
    const key = lines.join("\n");
    if (key !== shownNotices) {
      noticeList.replaceChildren(...(lines.length ? lines : [tr("まだ記録はない。", "Nothing yet.")]).map(line => {
        const item = document.createElement("li"); item.textContent = line; return item;
      }));
      shownNotices = key;
    }
    const latest = shown[0]?.time ?? 0;
    if (dialog.open && latest > seenAt()) markSeen(latest);
    const unseen = shown.filter(notice => notice.time > seenAt()).length;
    if (unseen) entry.dataset.unseen = String(unseen); else delete entry.dataset.unseen;
    entry.title = unseen ? tr(`スマホからの依頼・出陣 ${unseen}件`, `${unseen} phone requests/setoffs`) : "";
  }
  async function mutate(action: () => Promise<MobileState>): Promise<void> {
    if (busy) return;
    busy = true; version++;
    for (const button of dialog.querySelectorAll<HTMLButtonElement | HTMLInputElement>("button:not(#mobile-close), .mobile-work input")) button.disabled = true;
    try { render(await action()); } catch (cause) { error(cause); }
    finally {
      busy = false;
      for (const button of dialog.querySelectorAll<HTMLButtonElement | HTMLInputElement>("button, .mobile-work input")) button.disabled = false;
      if (current.enabled) get<HTMLButtonElement>("pair").disabled = current.devices.length >= 5;
      for (const item of rows.values()) item.test.disabled = !current.enabled || current.pushResults === undefined;
    }
  }
  async function poll(): Promise<void> {
    if (busy || !dialog.open) return;
    // A poll that started before a mutation must not overwrite the mutation's newer state.
    const started = version;
    try { const value = await loadMobile(); if (dialog.open && !busy && started === version) render(value); } catch (cause) { error(cause); }
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
