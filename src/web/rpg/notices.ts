import { ago as timeAgo, tr } from "../language";
import { moods, type Room } from "../../core/room";
import { renderHerald, noticesInTown, NOTICE_ORDER, type Notice } from "../town/herald";
import type { Project } from "../town/world";
import type { Permission } from "./hud";
import { unreadReports } from "./read-reports";
import { partyNotices } from "./party-notices";

export function initNotices(root: HTMLElement, pick: (notice: Notice) => void, counted: (n: number) => void, townName: (key: string) => string = (key) => key) {
  let signature = "";
  // Urgent calls cross town borders; ordinary news stays local.
  return (room: Room, towns: Project[], permissions: Map<string, Permission>, names: Map<string, string>, now: number, town?: string) => {
    let list: Notice[] = partyNotices(room, names);
    const ago = (at: number) => timeAgo(now - at);
    for (const permission of permissions.values()) {
      const hero = permission.agent ?? "default", agent = room.agents.get(hero);
      list.push({ kind: "permission", id: permission.id, at: permission.expiresAt, hero, repo: agent?.project ?? agent?.name ?? "",
        text: tr(`${names.get(hero) ?? agent?.name ?? hero} が「${permission.summary}」の きょかを まっている`, `${names.get(hero) ?? agent?.name ?? hero} asks permission: ${permission.summary}`), ago: tr("きょかまち", "Awaiting permission") });
    }
    for (const town of towns) if (!town.theme && town.heroes) {
      list.push({ kind: "new", repo: town.repo, text: tr("あたらしい町！ すがたを えらぼう", "New town! Choose its look"), ago: "" });
    }
    for (const agent of room.agents.values()) {
      const hero = agent.id, repo = agent.project ?? agent.name, name = names.get(hero) ?? agent.name;
      if (agent.activity === "ask" && ![...permissions.values()].some((p) => (p.agent ?? "default") === hero)) {
        list.push({ kind: "call", repo, hero, at: agent.since, text: tr(`${name}が あなたを よんでいる`, `${name} is calling you`), ago: ago(agent.since) });
      }
      if (agent.down?.active) {
        list.push({ kind: "down", repo, hero, at: agent.down.at, text: tr(`${name}が とちゅうで たおれた`, `${name} went down`), ago: ago(agent.down.at) });
      }
      if (moods(agent, now).includes("struggling")) {
        list.push({ kind: "struggle", repo, hero, at: agent.failures[agent.failures.length - 1], text: tr(`${name}が くるしい たたかい`, `${name} is in a tough battle`), ago: ago(agent.failures[agent.failures.length - 1]) });
      }
      for (const reply of unreadReports(agent)) {
        list.push({ kind: "report", repo, hero, at: reply.at, text: tr(`${name}から ほうこく`, `Report from ${name}`), ago: ago(reply.at) });
      }
    }
    list = noticesInTown(list, town);
    counted(list.length);
    list.sort((a, b) => NOTICE_ORDER.indexOf(a.kind) - NOTICE_ORDER.indexOf(b.kind) || (b.at ?? 0) - (a.at ?? 0));
    const next = JSON.stringify([town, list, towns.map((item) => item.label)]);
    if (signature === next) return;
    signature = next;
    renderHerald(root, list, pick, town, townName);
    if (!list.length) {
      const empty = document.createElement("p"); empty.className = "herald-empty"; empty.textContent = tr("いまは おしらせ なし", "No news for now"); root.append(empty);
    }
  };
}
