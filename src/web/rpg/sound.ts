import { tr } from "../language";
import { canPlaySound, notificationSound, rememberPermissionSound, type NotificationSound, type PlayedSounds,
  type SoundNotice } from "../../core/notification-sound";
import type { SoundMode } from "../../core/town-ledger";
import { loadSettings, saveSettings } from "./ledger";

// Recipes chosen on the listening page; Hz, start seconds, duration seconds.
const SOUNDS: Record<NotificationSound, { wave: OscillatorType; gain: number; notes: number[][] }> = {
  permission: { wave: "square", gain: 0.064, notes: [[740, 0, 0.08], [988, 0.12, 0.11]] },
  report: { wave: "triangle", gain: 0.042, notes: [[659, 0, 0.1], [784, 0.12, 0.21]] },
  failure: { wave: "square", gain: 0.028, notes: [[262, 0, 0.135], [175, 0.165, 0.175]] },
  "level-up": { wave: "square", gain: 0.027, notes: [[523, 0, 0.075], [659, 0.09, 0.075], [784, 0.18, 0.08], [1047, 0.28, 0.14]] },
};
let context: AudioContext | undefined;
let mode: SoundMode = "off"; // Wait for the saved preference before accepting notifications.
const LABELS: Record<SoundMode, string> = { all: tr("おと：ぜんいん", "Sound: all heroes"), follow: tr("おと：ついていく勇者だけ", "Sound: followed hero"), off: tr("おと：なし", "Sound: off") };
const played: PlayedSounds = {};
const seenPermissions = new Set<string>();

function unlock(): void {
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume().catch(() => undefined);
  } catch { /* Audio may be unavailable; the town still works without it. */ }
}

function play(sound: NotificationSound): void {
  const now = performance.now();
  if (!canPlaySound(sound, played, now, mode !== "off", context?.state === "running")) return;
  const audio = context!;
  const recipe = SOUNDS[sound];
  const start = audio.currentTime;
  for (const [hz, offset, duration] of recipe.notes) {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = recipe.wave;
    oscillator.frequency.value = hz;
    gain.gain.setValueAtTime(0, start + offset);
    gain.gain.linearRampToValueAtTime(recipe.gain, start + offset + 0.008);
    gain.gain.linearRampToValueAtTime(0, start + offset + duration);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(start + offset);
    oscillator.stop(start + offset + duration);
  }
  played[sound] = now;
}

export function notifySound(notice: SoundNotice, live: boolean, followedId: string | undefined): void {
  const sound = notificationSound(notice, live, seenPermissions, mode, followedId);
  // Remember even silent/replayed requests so enabling audio cannot ring an old request.
  if (notice.type === "permission") rememberPermissionSound(seenPermissions, notice.id);
  if (sound) play(sound);
}

export async function initSound(say: (message: string) => void): Promise<void> {
  // Register before initTitleScreen: its window capture consumes the first key.
  window.addEventListener("click", unlock, true);
  window.addEventListener("keydown", unlock, true);
  const button = document.querySelector<HTMLButtonElement>("#sound")!;
  function render(): void {
    button.dataset.mode = mode;
    button.setAttribute("aria-label", LABELS[mode]);
  }
  button.addEventListener("click", async () => {
    const previous = mode;
    mode = mode === "all" ? "follow" : mode === "follow" ? "off" : "all";
    render();
    say(LABELS[mode]);
    button.disabled = true;
    try {
      await saveSettings({ sound: mode });
      if (mode !== "off") play("report");
    } catch {
      mode = previous;
      render();
      say(tr("おとの設定を 保存できなかった。もう一度ためそう。", "Could not save sound. Try again."));
    } finally { button.disabled = false; }
  });
  try {
    mode = (await loadSettings()).sound;
    render();
    button.disabled = false;
  } catch {
    render();
    say(tr("おとの設定を 読み込めなかった。ページを読み込み直そう。", "Could not load sound settings. Reload."));
  }
}
