import type { RoomAgent } from "../../core/room";
import { townNameForKey } from "../../core/town-ledger";
import { tr } from "../language";

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
}

export function renderPartyList(root: HTMLElement, agents: RoomAgent[], row: (agent: RoomAgent) => HTMLElement,
  townName: (town: string) => string = (town) => townNameForKey(town, [])): void {
  const grouped = root.dataset.bases === "true";
  const toggle = element("button", "party-base-toggle", tr("拠点ごとに まとめる", "Group by base")); toggle.type = "button";
  toggle.setAttribute("aria-pressed", String(grouped));
  toggle.onclick = () => { root.dataset.bases = String(!grouped); renderPartyList(root, agents, row, townName); };
  const towns = new Map<string, RoomAgent[]>();
  for (const agent of agents) {
    const town = agent.project ?? agent.name;
    towns.set(town, [...(towns.get(town) ?? []), agent]);
  }
  root.replaceChildren(toggle);
  for (const [town, members] of [...towns].sort(([a], [b]) => a.localeCompare(b))) {
    root.append(element("h3", "party-town", tr(`${townName(town)}（${members.length}人）`, `${townName(town)} (${members.length} heroes)`)));
    if (!grouped) { root.append(...members.map(row)); continue; }
    const bases = new Map<string, RoomAgent[]>();
    for (const member of members) {
      const branch = member.branch || tr("拠点 ふめい", "Unknown base");
      bases.set(branch, [...(bases.get(branch) ?? []), member]);
    }
    for (const [branch, heroes] of [...bases].sort(([a], [b]) => a.localeCompare(b))) {
      root.append(element("h4", "party-base", `⑂ ${branch} (${heroes.length})`), ...heroes.map(row));
    }
  }
}
