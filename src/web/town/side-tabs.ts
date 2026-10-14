import { tr } from "../language";
type Tab = "herald" | "party" | "quests";
const KEYS: Tab[] = ["herald", "party", "quests"];
const KEY = "yushario-side-tab";

// The sidebar's three tabs; the chosen tab is a page-local convenience.
export function initSideTabs() {
  const tabs = { herald: document.querySelector<HTMLButtonElement>("#tab-herald")!, party: document.querySelector<HTMLButtonElement>("#tab-party")!, quests: document.querySelector<HTMLButtonElement>("#tab-quests")! };
  const names: Record<Tab, string> = { herald: tr("でんれい", "Herald"), party: tr("ゆうしゃ", "Heroes"), quests: tr("クエスト", "Quests") };
  function show(tab: Tab): void {
    for (const key of KEYS) {
      tabs[key].setAttribute("aria-selected", String(key === tab));
      document.querySelector<HTMLElement>(`#${key}`)!.hidden = key !== tab;
    }
    try { localStorage.setItem(KEY, tab); } catch { /* Still usable without storage. */ }
  }
  for (const key of KEYS) tabs[key].addEventListener("click", () => show(key));
  let saved: string | null = null;
  try { saved = localStorage.getItem(KEY); } catch { /* Default tab. */ }
  show(saved === "party" || saved === "quests" ? saved : "herald");
  return {
    show,
    count(tab: Tab, n: number): void { const text = tr(`${names[tab]}（${n}）`, `${names[tab]} (${n})`); if (tabs[tab].textContent !== text) tabs[tab].textContent = text; },
  };
}
