import type { TownSettings } from "../core/town-ledger";

// One choice for the lifetime of a page. A change in Settings reloads the page.
export let language: "ja" | "en" = navigator.language.toLowerCase().startsWith("ja") ? "ja" : "en";
const token = new URLSearchParams(location.search).get("token");
if (token) {
  try {
    const url = `/api/settings?token=${encodeURIComponent(token)}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Settings ${response.status}`);
    const settings: TownSettings = await response.json();
    if (settings.language === "auto") {
      const saved = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archiveAfterDays: settings.archiveAfterDays, sound: settings.sound, language, saveConversation: settings.saveConversation ?? false }) });
      if (!saved.ok) throw new Error(`Settings ${saved.status}`);
    } else language = settings.language;
  } catch (error) { console.warn("Could not load/save the screen language:", error); }
}
document.documentElement.lang = language;
export function tr(ja: string, en: string): string { return language === "ja" ? ja : en; }

// Static HTML keeps its Japanese text; English sits alongside on the same element.
if (language === "en") {
  for (const node of document.querySelectorAll<HTMLElement>("[data-en]")) node.textContent = node.dataset.en!;
  for (const attr of ["aria-label", "placeholder", "title"]) {
    for (const node of document.querySelectorAll<HTMLElement>(`[data-en-${attr}]`)) {
      node.setAttribute(attr, node.getAttribute(`data-en-${attr}`)!);
    }
  }
}

// The log shows minutes; reports, records and the roster keep seconds as they always have.
export function clock(at: number, seconds = false): string {
  return new Date(at).toLocaleTimeString(language === "ja" ? "ja-JP" : "en-GB", {
    hour: "2-digit", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}), hourCycle: "h23",
  });
}
export function dateTime(at: number): string {
  const date = new Date(at);
  const day = date.toLocaleDateString(language === "ja" ? "ja-JP" : "en-US", {
    year: "numeric", month: language === "ja" ? "2-digit" : "short", day: language === "ja" ? "2-digit" : "numeric",
  });
  return tr(`${day} ${clock(at, true)}`, `${day}, ${clock(at, true)}`);
}
export function ago(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (language === "ja") {
    const seconds = Math.max(0, Math.round(ms / 1000));
    return ms < 1000 ? "いま" : `${seconds >= 60 ? `${Math.floor(seconds / 60)}分 ${seconds % 60}秒` : `${seconds}秒`}前`;
  }
  return minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago`
    : minutes < 1440 ? `${Math.floor(minutes / 60)} h ago` : `${Math.floor(minutes / 1440)} d ago`;
}
