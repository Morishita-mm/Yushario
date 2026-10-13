import { moods, type Room } from "../../core/room";
import { renderHerald, type Notice } from "../town/herald";
import type { Project } from "../town/world";
import type { Permission } from "./hud";
import { duration } from "./report-card";
import { unreadReports } from "./read-reports";

const ORDER: Notice["kind"][] = ["permission", "call", "new", "struggle", "report"];

export function initNotices(root: HTMLElement, pick: (notice: Notice) => void, counted: (n: number) => void) {
  let signature = "";
  // Inside a town only that town's notices; on the world map, every town's.
  return (room: Room, towns: Project[], permissions: Map<string, Permission>, names: Map<string, string>, now: number, town?: string) => {
    let list: Notice[] = [];
    const ago = (at: number) => now - at < 1000 ? "いま" : `${duration(now - at)}前`;
    for (const permission of permissions.values()) {
      const hero = permission.agent ?? "default", agent = room.agents.get(hero);
      list.push({ kind: "permission", hero, repo: agent?.project ?? agent?.name ?? "",
        text: `${names.get(hero) ?? agent?.name ?? hero} が「${permission.summary}」の きょかを まっている`, ago: "きょかまち" });
    }
    for (const town of towns) if (!town.theme && town.heroes) {
      list.push({ kind: "new", repo: town.repo, text: "あたらしい町！ すがたを えらぼう", ago: "" });
    }
    for (const agent of room.agents.values()) {
      const hero = agent.id, repo = agent.project ?? agent.name, name = names.get(hero) ?? agent.name;
      if (agent.activity === "ask" && ![...permissions.values()].some((p) => (p.agent ?? "default") === hero)) {
        list.push({ kind: "call", repo, hero, text: `${name}が あなたを よんでいる`, ago: ago(agent.since) });
      }
      if (moods(agent, now).includes("struggling")) {
        list.push({ kind: "struggle", repo, hero, text: `${name}が くるしい たたかい`, ago: ago(agent.failures[agent.failures.length - 1]) });
      }
      for (const reply of unreadReports(agent)) {
        list.push({ kind: "report", repo, hero, at: reply.at, text: `${name}から ほうこく`, ago: ago(reply.at) });
      }
    }
    if (town !== undefined) list = list.filter((notice) => notice.repo === town);
    counted(list.length);
    list.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || (b.at ?? 0) - (a.at ?? 0));
    const next = JSON.stringify(list);
    if (signature === next) return;
    signature = next;
    renderHerald(root, list, pick);
    if (!list.length) {
      const empty = document.createElement("p"); empty.className = "herald-empty"; empty.textContent = "いまは おしらせ なし"; root.append(empty);
    }
  };
}
