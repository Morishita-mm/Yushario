import { clock, language, tr } from "../language";
import { icon, iconLabel, type IconName } from "../icons";
import type { Activity } from "../../core/activity";
import type { Mood, RoomAgent } from "../../core/room";
import { jobName, jobOf, stats } from "../../core/story";
import { heroAccent } from "../town/appearance";
import { interruptStatus } from "./interrupt-status";
import { codexNotice } from "./agents";

export const DOING: Record<Activity, (target: string) => string> = {
  idle: () => tr("まちで ひとやすみしている", "Resting in town"), think: () => tr("たきびの まえで かんがえている", "Thinking by the fire"),
  read: (t) => tr(`としょかんで ${t || "まどうしょ"}を よんでいる`, `Reading ${t || "a spellbook"}`), search: () => tr("しょこを さがしまわっている", "Searching the archives"),
  edit: (t) => tr(`${t || "まもの"}と たたかっている`, `Battling ${t || "a monster"}`), test: (t) => tr(`しれんの ゴーレムと たたかっている ${t}`, `Battling the Golem ${t}`),
  run: (t) => tr(`じゅもん「${t || "？"}」を となえている`, `Casting "${t || "?"}"`), git: (t) => tr(`ぼうけんのしょに きろくしている ${t}`, `Recording the journey ${t}`),
  web: (t) => tr(`ものみのとうで ${t || "とおく"}を みている`, `Surveying ${t || "the horizon"}`), plan: () => tr("クエストを ねっている", "Planning a quest"),
  delegate: () => tr("なかまと ドラゴンに いどんでいる", "Battling the Dragon together"), ask: () => tr("あなたを よんでいる！", "Calling you!"),
  tool: (t) => tr(`どうぐを つかっている ${t}`, `Using a tool ${t}`), rest: () => tr("きょうかいで いのりを ささげている", "Praying at the church"),
};
const MOODS: Record<Mood, [IconName, string]> = {
  waiting_long: ["hourglass", tr("まちくたびれている", "Waiting a while")], struggling: ["sweat", tr("くるしい たたかい", "Tough battle")], recovered: ["sparkle", tr("たちなおった", "Recovered")],
  flowing: ["music", tr("ちょうしが いい", "In good spirits")], tired: ["sleep", tr("つかれぎみ", "Tired")], calling_long: ["alert", tr("ずっと よんでいる", "Still calling")], dozing: ["sleep", tr("いねむり", "Dozing")],
};
function branchLabel(branch: string): HTMLElement {
  const node = element("small", "branch-name"); node.append(iconLabel("branch", branch)); return node;
}

export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function bar(label: string, value: number | undefined, color: string): HTMLElement {
  const row = element("div", value === undefined ? "bar unknown" : "bar");
  const track = element("span", "track");
  const fill = element("span", "fill");
  fill.style.width = value === undefined ? "100%" : `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
  fill.style.background = value === undefined ? "#777" : color;
  track.append(fill);
  row.append(element("span", "label", label), track, element("span", "value", value === undefined ? "？" : `${Math.round(value * 100)}`));
  return row;
}
function levelLabel(level: number): HTMLElement {
  const label = element("span", "level", `Lv ${level}`);
  return label;
}
function hpColor(hp: number): string { return hp > 0.5 ? "#7ee08a" : hp > 0.25 ? "#ffd35a" : "#ff6b5b"; }

// What the hero is doing, in words ("Editing a.ts"), with a stop or interruption first.
export const heroDoing = (agent: RoomAgent, now: number): string => interruptStatus(agent, now) ?? DOING[agent.activity](agent.target ?? "");
export function compactRow(agent: RoomAgent, now: number, name: string, selected: boolean, waiting: boolean, pick: () => void, gear?: string, quest?: string): HTMLElement {
  const { level, hp, mp } = stats(agent, now);
  const row = element("button", "compact-hero"); row.type = "button"; row.dataset.hero = agent.id;
  row.classList.toggle("selected", selected); row.classList.toggle("waiting", waiting || agent.activity === "ask");
  row.setAttribute("aria-pressed", String(selected));
  const doing = heroDoing(agent, now);
  row.title = `${name}${agent.branch ? ` [${agent.branch}]` : ""} · Lv ${level} · HP ${Math.round(hp * 100)} · MP ${mp === undefined ? "？" : Math.round(mp * 100)} · ${doing}`;
  row.setAttribute("aria-label", row.title);
  const badge = element("span", "compact-name", `${waiting ? "！ " : ""}${name}`);
  if (agent.branch) badge.append(branchLabel(agent.branch));
  row.append(badge, levelLabel(level));
  const bars = element("span", "compact-bars"); bars.append(bar("HP", hp, hpColor(hp)), bar("MP", mp, "#62b8ff"));
  row.append(bars, element("span", "compact-doing", doing));
  if (gear) row.append(element("span", "compact-gear", gear));
  if (quest) row.append(element("span", "compact-quest", tr(`クエスト：${quest}`, `Quest: ${quest}`)));
  row.addEventListener("click", pick);
  return row;
}

export function statusCard(agent: RoomAgent, agentMoods: Mood[], permission: HTMLElement | undefined, now: number,
  name: string, detailed: boolean, select: () => void, openTerminal: (terminal: string) => void, equipment: string[] = [], review?: () => void): HTMLElement {
  const { level, hp, mp } = stats(agent, now);
  const card = element("article", detailed ? "hero" : "window hero selected");
  card.dataset.agent = agent.id;
  if (!detailed) card.addEventListener("click", select);
  const head = element("header");
  const crest = element("span", "crest"); crest.style.background = heroAccent(agent.id);
  head.append(crest, element("strong", undefined, name), levelLabel(level));
  card.append(head);
  if (agent.branch) card.append(branchLabel(agent.branch));
  card.append(bar("HP", hp, hpColor(hp)), bar("MP", mp, "#62b8ff"));
  card.append(element("p", "doing", `▶ ${interruptStatus(agent, now) ?? DOING[agent.activity](agent.target ?? "")}`));
  if (agent.source === "codex") card.append(element("p", "hint", codexNotice()));
  if (equipment.length) {
    card.append(element("p", "section", tr("そうび", "Equipment")));
    for (const text of equipment) card.append(element("p", "hint", text));
  }
  if (detailed) {
    const seconds = Math.max(0, Math.floor((now - agent.since) / 1000));
    card.append(element("p", "hint", tr(`この行動を ${Math.floor(seconds / 60)}分 ${seconds % 60}秒 つづけている`, `${Math.floor(seconds / 60)}m ${seconds % 60}s in this action`)));
  }
  if (!detailed && agent.terminal) {
    const actions = element("div", "actions");
    const terminal = element("button", undefined, tr("▶ ターミナル", "▶ Terminal")); terminal.type = "button";
    terminal.addEventListener("click", (event) => { event.stopPropagation(); openTerminal(agent.terminal!); });
    actions.append(terminal);
    if (review) {
      const button = element("button", undefined, tr("▶ かんてい", "▶ Review")); button.type = "button";
      button.addEventListener("click", (event) => { event.stopPropagation(); review(); }); actions.append(button);
    }
    card.append(actions);
  } else if (!detailed) card.append(element("p", "hint", tr("外から来た 勇者", "Visiting hero")));
  if (detailed && agent.terminal && review) {
    const button = element("button", undefined, tr("▶ かんてい", "▶ Review")); button.type = "button";
    button.addEventListener("click", review); card.append(button);
  }
  if (detailed || agentMoods.length) {
    const chips = element("p", "moods");
    for (const mood of agentMoods) { const chip = iconLabel(...MOODS[mood]); chip.classList.add("chip"); chips.append(chip); }
    if (!agentMoods.length) chips.append(element("span", "chip", tr("いつもどおり", "As usual")));
    if (detailed) card.append(element("p", "section", tr("きぶん", "Mood")));
    card.append(chips);
  }
  if (mp !== undefined && mp <= 0.1) card.append(element("p", "hint", tr("MPが のこりわずか！", "MP is running low!")));
  if (detailed || agent.helpers.length) {
    const party = element("ul", "party");
    for (const helper of agent.helpers) {
      party.append(element("li", undefined, tr(`${jobName(jobOf(helper.type))}（${helper.type ?? "なかま"}）: ${DOING[helper.activity](helper.target ?? "")}`, `${jobName(jobOf(helper.type), language)} (${helper.type ?? "Ally"}): ${DOING[helper.activity](helper.target ?? "")}`)));
    }
    if (!agent.helpers.length) party.append(element("li", undefined, tr("いまは ひとりで ぼうけんしている", "Adventuring solo")));
    card.append(element("p", "section", tr("なかま", "Party")), party);
  }
  if (detailed || agent.tasks.length) {
    const done = agent.tasks.filter((task) => task.status === "completed").length;
    const list = element("ul", "quests");
    for (const task of agent.tasks) {
      const row = element("li", task.status);
      row.append(task.status === "completed" ? icon("check") : task.status === "in_progress" ? "▶" : "・", ` ${task.subject ?? `#${task.id}`}`);
      if (task.status === "completed") row.setAttribute("aria-label", tr(`完了：${task.subject ?? task.id}`, `Completed: ${task.subject ?? task.id}`));
      list.append(row);
    }
    if (!agent.tasks.length) list.append(element("li", undefined, tr("まだ クエストは ありません", "No quests yet")));
    card.append(element("p", "section", tr(`クエスト ${done}/${agent.tasks.length}${detailed ? " たっせい" : ""}`, `Quests ${done}/${agent.tasks.length}${detailed ? " complete" : ""}`)), list);
  }
  if (permission) card.append(permission);
  const log = element("ol", "log");
  for (const entry of agent.log.slice(-12).reverse()) {
    const time = clock(entry.at, true);
    const outcome = entry.outcome === "ok" ? " ○" : entry.outcome === "failed" ? " ×" : "";
    log.append(element("li", entry.outcome, `${time} ${DOING[entry.activity](entry.target ?? "")}${outcome}`));
  }
  if (detailed && !agent.log.length) log.append(element("li", undefined, tr("まだ きろくは ありません", "No records yet")));
  if (log.childElementCount) card.append(element("p", "section", detailed ? tr("さいきんの きろく", "Recent records") : tr("ぼうけんの きろく", "Adventure log")), log);
  return card;
}
