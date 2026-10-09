import type { Activity } from "../../core/activity";
import { moods, type Mood, type Room, type RoomAgent } from "../../core/room";
import { JOB_NAMES, jobOf, stats } from "../../core/story";
import { heroAccent } from "./sprites";

export type Permission = { id: string; tool: string; summary: string; agent?: string };
type Decision = "allow" | "deny" | "terminal";

const DOING: Record<Activity, (target: string) => string> = {
  idle: () => "やどやで やすんでいる", think: () => "たきびの まえで かんがえている",
  read: (t) => `としょかんで ${t || "まどうしょ"}を よんでいる`, search: () => "しょこを さがしまわっている",
  edit: (t) => `${t || "まもの"}と たたかっている`, test: (t) => `しれんの ゴーレムと たたかっている ${t}`,
  run: (t) => `じゅもん「${t || "？"}」を となえている`, git: (t) => `ぼうけんのしょに きろくしている ${t}`,
  web: (t) => `ものみのとうで ${t || "とおく"}を みている`, plan: () => "クエストを ねっている",
  delegate: () => "なかまと ドラゴンに いどんでいる", ask: () => "あなたを よんでいる！",
  tool: (t) => `どうぐを つかっている ${t}`, rest: () => "きょうかいで いのっている",
};
const MOODS: Record<Mood, string> = {
  waiting_long: "⏳ まちくたびれている", struggling: "💦 くるしい たたかい", recovered: "✨ たちなおった",
  flowing: "♪ ちょうしが いい", tired: "💤 つかれぎみ", calling_long: "❗ ずっと よんでいる", dozing: "💤 いねむり",
};
const LOG_SHOWN = 12;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
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

// Status windows, one per hero; rebuilt only when what they show changes.
export class Status {
  readonly permissions = new Map<string, Permission>();
  private readonly signatures = new Map<string, string>();

  constructor(
    private readonly root: HTMLElement,
    private readonly respond: (id: string, decision: Decision) => void,
    private readonly select: (agent: string | undefined) => void,
  ) {}

  render(room: Room, now: number, selected: string | undefined): void {
    const cards: HTMLElement[] = [];
    for (const agent of room.agents.values()) {
      const permission = [...this.permissions.values()].find((item) => (item.agent ?? "default") === agent.id);
      const agentMoods = moods(agent, now);
      const agentStats = stats(agent, now);
      const signature = JSON.stringify([agent.name, agent.activity, agent.target, agentMoods, agentStats,
        agent.tasks, agent.helpers, permission?.id, agent.id === selected, agent.id === selected && agent.log]);
      let card = this.root.querySelector<HTMLElement>(`[data-agent="${CSS.escape(agent.id)}"]`);
      if (!card || this.signatures.get(agent.id) !== signature) {
        card = this.card(agent, agentMoods, permission, agent.id === selected, now);
        this.signatures.set(agent.id, signature);
      }
      cards.push(card);
    }
    for (const permission of this.permissions.values()) {
      if (!room.agents.has(permission.agent ?? "default")) cards.push(this.permissionBlock(permission));
    }
    if (!cards.length) {
      cards.push(element("p", "empty window", "まだ だれも いない ようだ…\nフックを せっていした Claude Code を きどうすると、ゆうしゃが まちに やってくる。"));
    }
    if (cards.length !== this.root.children.length || cards.some((card, index) => this.root.children[index] !== card)) {
      this.root.replaceChildren(...cards);
    }
    for (const id of this.signatures.keys()) if (!room.agents.has(id)) this.signatures.delete(id);
  }

  private card(agent: RoomAgent, agentMoods: Mood[], permission: Permission | undefined, selected: boolean, now: number): HTMLElement {
    const { level, hp, mp } = stats(agent, now);
    const card = element("article", selected ? "window hero selected" : "window hero");
    card.dataset.agent = agent.id;
    card.addEventListener("click", () => this.select(selected ? undefined : agent.id));
    const head = element("header");
    const crest = element("span", "crest");
    crest.style.background = heroAccent(agent.id);
    head.append(crest, element("strong", undefined, agent.name), element("span", "level", `Lv ${level}`));
    card.append(head, bar("HP", hp, hp > 0.5 ? "#7ee08a" : hp > 0.25 ? "#ffd35a" : "#ff6b5b"), bar("MP", mp, "#62b8ff"));
    card.append(element("p", "doing", `▶ ${DOING[agent.activity](agent.target ?? "")}`));
    if (agentMoods.length) {
      const chips = element("p", "moods");
      for (const mood of agentMoods) chips.append(element("span", "chip", MOODS[mood]));
      card.append(chips);
    }
    if (mp <= 0.1) card.append(element("p", "hint", "MPが のこりわずか！ きょうかいで いのる（/compact）のが よさそうだ。"));
    if (agent.helpers.length) {
      const party = element("ul", "party");
      for (const helper of agent.helpers) {
        party.append(element("li", undefined, `${JOB_NAMES[jobOf(helper.type)]}（${helper.type ?? "なかま"}）: ${DOING[helper.activity](helper.target ?? "")}`));
      }
      card.append(element("p", "section", "なかま"), party);
    }
    if (agent.tasks.length) {
      const done = agent.tasks.filter((task) => task.status === "completed").length;
      const list = element("ul", "quests");
      for (const task of agent.tasks) {
        const mark = task.status === "completed" ? "✔" : task.status === "in_progress" ? "▶" : "・";
        list.append(element("li", task.status, `${mark} ${task.subject ?? `#${task.id}`}`));
      }
      card.append(element("p", "section", `クエスト ${done}/${agent.tasks.length}`), list);
    }
    if (permission) card.append(this.permissionBlock(permission));
    if (selected) {
      const log = element("ol", "log");
      for (const entry of agent.log.slice(-LOG_SHOWN).reverse()) {
        const time = new Date(entry.at).toLocaleTimeString("ja-JP", { hour12: false });
        const outcome = entry.outcome === "ok" ? " ○" : entry.outcome === "failed" ? " ×" : "";
        log.append(element("li", entry.outcome, `${time} ${DOING[entry.activity](entry.target ?? "")}${outcome}`));
      }
      card.append(element("p", "section", "ぼうけんの きろく"), log);
    }
    return card;
  }

  private permissionBlock(permission: Permission): HTMLElement {
    const block = element("div", "permission");
    block.append(element("p", undefined, `「${permission.summary}」\nを おこなっても よいですか？`));
    const actions = element("div", "actions");
    for (const [label, decision] of [["はい", "allow"], ["いいえ", "deny"], ["ターミナルで こたえる", "terminal"]] as const) {
      const button = element("button", undefined, `▶ ${label}`);
      button.type = "button";
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        this.respond(permission.id, decision);
      });
      actions.append(button);
    }
    block.append(actions);
    return block;
  }
}

// The message window: narration typed out a character at a time, newest at the bottom.
export class Messages {
  private lines: { text: string; shown: number }[] = [];

  constructor(private readonly root: HTMLElement) {}

  say(text: string, instant = false): void {
    this.lines.push({ text, shown: instant ? text.length : 0 });
    if (this.lines.length > 4) this.lines.shift();
  }

  tick(): void {
    const typing = this.lines.find((line) => line.shown < line.text.length);
    if (typing) typing.shown = Math.min(typing.text.length, typing.shown + 2);
    const text = this.lines.map((line) => line.text.slice(0, line.shown)).join("\n");
    if (this.root.textContent !== text) this.root.textContent = text;
  }
}
