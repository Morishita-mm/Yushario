type Tab = "herald" | "party";
const KEY = "yushario-side-tab";

// The sidebar's two tabs; the chosen tab is a page-local convenience.
export function initSideTabs() {
  const tabs = { herald: document.querySelector<HTMLButtonElement>("#tab-herald")!, party: document.querySelector<HTMLButtonElement>("#tab-party")! };
  const names: Record<Tab, string> = { herald: "でんれい", party: "ゆうしゃ" };
  function show(tab: Tab): void {
    for (const key of ["herald", "party"] as const) {
      tabs[key].setAttribute("aria-selected", String(key === tab));
      document.querySelector<HTMLElement>(`#${key}`)!.hidden = key !== tab;
    }
    try { localStorage.setItem(KEY, tab); } catch { /* Still usable without storage. */ }
  }
  for (const key of ["herald", "party"] as const) tabs[key].addEventListener("click", () => show(key));
  let saved: string | null = null;
  try { saved = localStorage.getItem(KEY); } catch { /* Default tab. */ }
  show(saved === "party" ? "party" : "herald");
  return {
    show,
    count(tab: Tab, n: number): void { const text = `${names[tab]}（${n}）`; if (tabs[tab].textContent !== text) tabs[tab].textContent = text; },
  };
}
