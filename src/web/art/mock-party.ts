import { tr } from "../language";
import { moods, Room } from "../../core/room";
import type { AgentEvent } from "../../core/events";
import { compactRow, element, statusCard } from "../rpg/status-card";
import { FIGHTS, PRAYERS, SLEEPERS, townHeroes } from "./mock-data";
import { renderPartyList } from "../town/party-list";
import "../rpg/worktrees.css";
import { mockReview } from "./mock-review";

export type MockPlace = "town" | "meadow" | "cave" | "forest" | "inn" | "church";
const DOZING = 15 * 60_000;

// The mock's ゆうしゃ tab, drawn with the app's own rows and card: a Room fed with fake hooks.
export function renderMockParty(root: HTMLElement, town: string, selected: string | undefined,
  pick: (name: string, place: MockPlace) => void): number {
  const now = Date.now(), room = new Room(), places = new Map<string, MockPlace>();
  const hook = (name: string, place: MockPlace, at: number, event: Partial<AgentEvent> = {}) => {
    places.set(name, place);
    room.apply({ state: "idle", hook: "SessionStart", agent: name, name, project: town, terminal: `mock-${name}`, branch: name.length % 2 ? "main" : "yushario/map", ...event }, at);
  };
  for (const hero of townHeroes()) hook(hero.name, "town", now);
  for (const theme of ["meadow", "cave", "forest"] as const) for (const fight of FIGHTS[theme]) {
    if (places.has(fight.name)) continue; // A name already shown in town.
    hook(fight.name, theme, now);
    const tool = theme === "meadow" ? { tool: "Edit", target: fight.target } : { tool: "Bash", target: fight.target };
    hook(fight.name, theme, now, fight.done ? { state: "success", hook: "Stop", text: tr("おわりました。", "Done.") } : { state: "working", hook: "PreToolUse", ...tool });
  }
  for (const name of SLEEPERS) hook(name, "inn", now - DOZING);
  for (const prayer of PRAYERS) { hook(prayer.name, "church", now); hook(prayer.name, "church", now, { state: "working", hook: "PreCompact" }); }
  const agents = [...room.agents.values()], chosen = agents.find((agent) => agent.id === selected) ?? agents[0];
  const list = root.querySelector<HTMLElement>(".party-list") ?? element("div", "party-list");
  renderPartyList(list, agents, (agent) => compactRow(agent, now, agent.name, agent === chosen, false, () => pick(agent.id, places.get(agent.id)!)));
  root.replaceChildren(list, ...(chosen ? [statusCard(chosen, moods(chosen, now), undefined, now, chosen.name, false, () => undefined, () => undefined, [], () => mockReview(chosen.name))] : []));
  return agents.length;
}
