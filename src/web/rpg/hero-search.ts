import type { HeroFilter, HeroState } from "../../core/hero-search";
import { tr } from "../language";
import { element } from "./status-card";

// The search box above the hero list: a town chip (set inside a town, removable), words, and state chips.
const STATES: (HeroState | "all")[] = ["all", "yours", "working", "resting"];
const stateLabel = (state: HeroState | "all"): string => ({ all: tr("ぜんぶ", "All"), yours: tr("あなたの番", "Your turn"), working: tr("作業中", "Working"), resting: tr("休み", "Resting") })[state];

export function heroSearch(changed: () => void) {
  const root = element("div", "hero-search"), input = element("input"), chips = element("div", "hero-search-chips");
  input.type = "search"; input.id = "hero-search-input"; input.maxLength = 80;
  input.placeholder = tr("勇者・町・branch で さがす", "Find by hero, town or branch");
  input.setAttribute("aria-label", input.placeholder);
  input.addEventListener("input", changed);
  input.addEventListener("keydown", (event) => { event.stopPropagation(); if (event.key === "Escape" && input.value) { input.value = ""; changed(); } });
  root.append(input, chips);
  let state: HeroState | "all" = "all", cleared: string | undefined;
  // Inside a town the town is the default; clearing it searches every town until you enter another one.
  const filter = (project: string | undefined): HeroFilter => ({ town: project !== undefined && cleared !== project ? project : undefined, query: input.value, state });
  function render(project: string | undefined, townName: string | undefined, counts: Record<HeroState | "all", number>): void {
    const town = filter(project).town;
    const parts: HTMLElement[] = [];
    if (town !== undefined) {
      const chip = element("button", "hero-search-town", tr(`町：${townName ?? town} ×`, `Town: ${townName ?? town} ×`)); chip.type = "button";
      chip.title = tr("この町だけで さがすのを やめる", "Search every town"); chip.onclick = () => { cleared = project; changed(); };
      parts.push(chip);
    } else if (project !== undefined) {
      const chip = element("button", "hero-search-town off", tr(`この町だけに する（${townName ?? project}）`, `Only this town (${townName ?? project})`)); chip.type = "button";
      chip.onclick = () => { cleared = undefined; changed(); }; parts.push(chip);
    }
    for (const item of STATES) {
      const chip = element("button", "hero-search-state", `${stateLabel(item)} ${counts[item]}`); chip.type = "button";
      chip.setAttribute("aria-pressed", String(item === state)); chip.onclick = () => { state = item; changed(); }; parts.push(chip);
    }
    chips.replaceChildren(...parts);
  }
  return { root, filter, render };
}
