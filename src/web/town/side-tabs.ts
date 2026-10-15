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
      tabs[key].tabIndex = key === tab ? 0 : -1;
      document.querySelector<HTMLElement>(`#${key}`)!.hidden = key !== tab;
    }
    try { localStorage.setItem(KEY, tab); } catch { /* Still usable without storage. */ }
  }
  for (const key of KEYS) {
    tabs[key].addEventListener("click", () => show(key));
    tabs[key].addEventListener("keydown", (event) => {
      if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
      const index = KEYS.indexOf(key);
      const next = event.key === "ArrowRight" ? KEYS[(index + 1) % KEYS.length]
        : event.key === "ArrowLeft" ? KEYS[(index + KEYS.length - 1) % KEYS.length]
        : event.key === "Home" ? KEYS[0] : event.key === "End" ? KEYS[KEYS.length - 1] : undefined;
      if (!next) return;
      event.preventDefault(); show(next); tabs[next].focus();
    });
  }
  let saved: string | null = null;
  try { saved = localStorage.getItem(KEY); } catch { /* Default tab. */ }
  show(saved === "party" || saved === "quests" ? saved : "herald");
  return {
    show,
    count(tab: Tab, n: number): void { const text = tr(`${names[tab]}（${n}）`, `${names[tab]} (${n})`); if (tabs[tab].textContent !== text) tabs[tab].textContent = text; },
  };
}
