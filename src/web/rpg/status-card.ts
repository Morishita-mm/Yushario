import type { Activity } from "../../core/activity";
import type { Mood, RoomAgent } from "../../core/room";
import { JOB_NAMES, jobOf, stats } from "../../core/story";
import { heroAccent } from "../town/appearance";

const DOING: Record<Activity, (target: string) => string> = {
  idle: () => "まちで ひとやすみしている", think: () => "たきびの まえで かんがえている",
  read: (t) => `としょかんで ${t || "まどうしょ"}を よんでいる`, search: () => "しょこを さがしまわっている",
  edit: (t) => `${t || "まもの"}と たたかっている`, test: (t) => `しれんの ゴーレムと たたかっている ${t}`,
  run: (t) => `じゅもん「${t || "？"}」を となえている`, git: (t) => `ぼうけんのしょに きろくしている ${t}`,
  web: (t) => `ものみのとうで ${t || "とおく"}を みている`, plan: () => "クエストを ねっている",
  delegate: () => "なかまと ドラゴンに いどんでいる", ask: () => "あなたを よんでいる！",
  tool: (t) => `どうぐを つかっている ${t}`, rest: () => "きょうかいで いのりを ささげている",
};
const MOODS: Record<Mood, string> = {
  waiting_long: "⏳ まちくたびれている", struggling: "💦 くるしい たたかい", recovered: "✨ たちなおった",
  flowing: "♪ ちょうしが いい", tired: "💤 つかれぎみ", calling_long: "❗ ずっと よんでいる", dozing: "💤 いねむり",
};

export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function bar(label: string, value: number, color: string): HTMLElement {
  const row = element("div", "bar");
  const track = element("span", "track");
  const fill = element("span", "fill");
  fill.style.width = `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
  fill.style.background = color;
  track.append(fill);
  row.append(element("span", "label", label), track, element("span", "value", `${Math.round(value * 100)}`));
  return row;
}
function levelLabel(level: number): HTMLElement {
  const label = element("span", "level", `Lv ${level}`);
  return label;
}
function hpColor(hp: number): string { return hp > 0.5 ? "#7ee08a" : hp > 0.25 ? "#ffd35a" : "#ff6b5b"; }

export function compactRow(agent: RoomAgent, now: number, name: string, selected: boolean, waiting: boolean, pick: () => void): HTMLElement {
  const { level, hp, mp } = stats(agent, now);
  const row = element("button", "compact-hero"); row.type = "button"; row.dataset.hero = agent.id;
  row.classList.toggle("selected", selected); row.classList.toggle("waiting", waiting || agent.activity === "ask");
  row.setAttribute("aria-pressed", String(selected));
  const doing = DOING[agent.activity](agent.target ?? "");
  row.title = `${name} · Lv ${level} · HP ${Math.round(hp * 100)} · MP ${Math.round(mp * 100)} · ${doing}`;
  row.setAttribute("aria-label", row.title);
  row.append(element("span", "compact-name", `${waiting ? "！ " : ""}${name}`), levelLabel(level));
  const bars = element("span", "compact-bars"); bars.append(bar("HP", hp, hpColor(hp)), bar("MP", mp, "#62b8ff"));
  row.append(bars, element("span", "compact-doing", doing));
  row.addEventListener("click", pick);
  return row;
}

export function statusCard(agent: RoomAgent, agentMoods: Mood[], permission: HTMLElement | undefined, now: number,
  name: string, detailed: boolean, select: () => void, openTerminal: (terminal: string) => void, equipment: string[] = []): HTMLElement {
  const { level, hp, mp } = stats(agent, now);
  const card = element("article", detailed ? "hero" : "window hero selected");
  card.dataset.agent = agent.id;
  if (!detailed) card.addEventListener("click", select);
  const head = element("header");
  const crest = element("span", "crest"); crest.style.background = heroAccent(agent.id);
  head.append(crest, element("strong", undefined, name), levelLabel(level));
  card.append(head, bar("HP", hp, hpColor(hp)), bar("MP", mp, "#62b8ff"));
  card.append(element("p", "doing", `▶ ${DOING[agent.activity](agent.target ?? "")}`));
  if (equipment.length) {
    card.append(element("p", "section", "そうび"));
    for (const text of equipment) card.append(element("p", "hint", text));
  }
  if (detailed) {
    const seconds = Math.max(0, Math.floor((now - agent.since) / 1000));
    card.append(element("p", "hint", `この行動を ${Math.floor(seconds / 60)}分 ${seconds % 60}秒 つづけている`));
  }
  if (!detailed && agent.terminal) {
    const actions = element("div", "actions");
    const terminal = element("button", undefined, "▶ ターミナル"); terminal.type = "button";
    terminal.addEventListener("click", (event) => { event.stopPropagation(); openTerminal(agent.terminal!); });
    actions.append(terminal); card.append(actions);
  } else if (!detailed) card.append(element("p", "hint", "外から来た 勇者"));
  if (detailed || agentMoods.length) {
    const chips = element("p", "moods");
    for (const mood of agentMoods) chips.append(element("span", "chip", MOODS[mood]));
    if (!agentMoods.length) chips.append(element("span", "chip", "いつもどおり"));
    if (detailed) card.append(element("p", "section", "きぶん"));
    card.append(chips);
  }
  if (mp <= 0.1) card.append(element("p", "hint", "MPが のこりわずか！"));
  if (detailed || agent.helpers.length) {
    const party = element("ul", "party");
    for (const helper of agent.helpers) {
      party.append(element("li", undefined, `${JOB_NAMES[jobOf(helper.type)]}（${helper.type ?? "なかま"}）: ${DOING[helper.activity](helper.target ?? "")}`));
    }
    if (!agent.helpers.length) party.append(element("li", undefined, "いまは ひとりで ぼうけんしている"));
    card.append(element("p", "section", "なかま"), party);
  }
  if (detailed || agent.tasks.length) {
    const done = agent.tasks.filter((task) => task.status === "completed").length;
    const list = element("ul", "quests");
    for (const task of agent.tasks) {
      const mark = task.status === "completed" ? "✔" : task.status === "in_progress" ? "▶" : "・";
      list.append(element("li", task.status, `${mark} ${task.subject ?? `#${task.id}`}`));
    }
    if (!agent.tasks.length) list.append(element("li", undefined, "まだ クエストは ありません"));
    card.append(element("p", "section", `クエスト ${done}/${agent.tasks.length}${detailed ? " たっせい" : ""}`), list);
  }
  if (permission) card.append(permission);
  const log = element("ol", "log");
  for (const entry of agent.log.slice(-12).reverse()) {
    const time = new Date(entry.at).toLocaleTimeString("ja-JP", { hour12: false });
    const outcome = entry.outcome === "ok" ? " ○" : entry.outcome === "failed" ? " ×" : "";
    log.append(element("li", entry.outcome, `${time} ${DOING[entry.activity](entry.target ?? "")}${outcome}`));
  }
  if (detailed && !agent.log.length) log.append(element("li", undefined, "まだ きろくは ありません"));
  card.append(element("p", "section", detailed ? "さいきんの きろく" : "ぼうけんの きろく"), log);
  return card;
}
