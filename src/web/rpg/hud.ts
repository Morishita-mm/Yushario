import type { Activity } from "../../core/activity";
import { moods, type Mood, type Room, type RoomAgent } from "../../core/room";
import { JOB_NAMES, jobOf, stats } from "../../core/story";
import { heroAccent } from "../town/appearance";

export type Permission = { id: string; tool: string; summary: string; agent?: string };
type Decision = "allow" | "deny" | "terminal";

const DOING: Record<Activity, (target: string) => string> = {
  idle: () => "まちで ひとやすみしている", think: () => "たきびの まえで かんがえている",
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

// The selected hero's original status window and permission responses.
export class Status {
  readonly permissions = new Map<string, Permission>();
  private readonly signatures = new Map<string, string>();
  private picker: HTMLSelectElement | undefined;
  private pickerSignature = "";
  private readonly dialog = document.querySelector<HTMLDialogElement>("#strength-dialog")!;
  private readonly details = document.querySelector<HTMLElement>("#strength-content")!;
  private detailed: string | undefined;
  private detailSignature = "";

  constructor(
    private readonly root: HTMLElement,
    private readonly respond: (id: string, decision: Decision) => void,
    private readonly select: (agent: string | undefined) => void,
    private readonly openTerminal: (terminal: string) => void,
  ) {
    const close = () => { this.detailed = undefined; this.dialog.close(); };
    this.dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
    this.dialog.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Escape" && !event.isComposing) { event.preventDefault(); close(); }
    });
    this.dialog.addEventListener("click", (event) => {
      if (event.target !== this.dialog) return;
      const bounds = this.dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
    });
    document.querySelector("#strength-close")!.addEventListener("click", close);
  }

  openDetails(room: Room, now: number, id: string, names: Map<string, string>): void {
    this.detailed = id; this.detailSignature = "";
    this.details.scrollTop = 0;
    this.renderDetails(room, now, names);
    if (!this.dialog.open) this.dialog.showModal();
    document.querySelector<HTMLButtonElement>("#strength-close")!.focus();
  }

  private signature(agent: RoomAgent, now: number, name: string, permission?: Permission, detailed = false): string {
    return JSON.stringify([name, agent.activity, agent.target, moods(agent, now), stats(agent, now),
      agent.tasks, agent.helpers, agent.terminal, permission, agent.log,
      detailed ? Math.max(0, Math.floor((now - agent.since) / 1000)) : undefined]);
  }

  private renderDetails(room: Room, now: number, names: Map<string, string>): void {
    if (!this.detailed) return;
    const agent = room.agents.get(this.detailed);
    const name = names.get(this.detailed) ?? agent?.name ?? this.detailed;
    document.querySelector<HTMLElement>("#strength-title")!.textContent = `${name}の つよさ`;
    const signature = agent ? this.signature(agent, now, name, undefined, true) : "departed";
    if (signature === this.detailSignature) return;
    this.detailSignature = signature;
    const scroll = this.details.scrollTop;
    this.details.replaceChildren(agent ? this.card(agent, moods(agent, now), undefined, now, name, true)
      : element("p", "hint", "この勇者は たびだちました。"));
    this.details.scrollTop = scroll;
  }

  render(room: Room, now: number, selected: string | undefined, names: Map<string, string>): void {
    this.renderDetails(room, now, names);
    const cards: HTMLElement[] = [];
    const agents = [...room.agents.values()];
    const chosen = room.agents.get(selected ?? "") ?? agents[0];
    if (agents.length) {
      const signature = JSON.stringify(agents.map((agent) => [agent.id, names.get(agent.id), agent.project]));
      if (!this.picker || signature !== this.pickerSignature) {
        this.picker = element("select", "hero-picker");
        this.picker.setAttribute("aria-label", "勇者をえらぶ");
        for (const agent of agents) {
          const option = element("option", undefined, `${names.get(agent.id) ?? agent.name} — ${agent.project ?? agent.name}`);
          option.value = agent.id;
          this.picker.append(option);
        }
        this.picker.addEventListener("change", () => this.select(this.picker!.value));
        this.pickerSignature = signature;
      }
      this.picker.value = chosen!.id;
      cards.push(this.picker);
    }
    for (const agent of chosen ? [chosen] : []) {
      const permission = [...this.permissions.values()].find((item) => (item.agent ?? "default") === agent.id);
      const agentMoods = moods(agent, now);
      const signature = this.signature(agent, now, names.get(agent.id) ?? agent.name, permission);
      let card = this.root.querySelector<HTMLElement>(`[data-agent="${CSS.escape(agent.id)}"]`);
      if (!card || this.signatures.get(agent.id) !== signature) {
        card = this.card(agent, agentMoods, permission, now, names.get(agent.id) ?? agent.name);
        this.signatures.set(agent.id, signature);
      }
      cards.push(card);
    }
    for (const permission of this.permissions.values()) {
      const id = permission.agent ?? "default";
      if (id === chosen?.id) continue;
      const agent = room.agents.get(id);
      const name = names.get(id) ?? agent?.name ?? id;
      const project = agent?.project ?? agent?.name;
      cards.push(this.permissionBlock(permission, project === undefined ? name : `${name} — ${project}`));
    }
    if (!cards.length) {
      cards.push(element("p", "empty window", "まだ だれも いない ようだ…\n「しゅつじん」で Claude Code を きどうすると、ゆうしゃが まちに やってくる。"));
    }
    if (cards.length !== this.root.children.length || cards.some((card, index) => this.root.children[index] !== card)) {
      this.root.replaceChildren(...cards);
    }
    for (const id of this.signatures.keys()) if (!room.agents.has(id)) this.signatures.delete(id);
  }

  private card(agent: RoomAgent, agentMoods: Mood[], permission: Permission | undefined, now: number, name: string, detailed = false): HTMLElement {
    const { level, hp, mp } = stats(agent, now);
    const card = element("article", detailed ? "hero" : "window hero selected");
    card.dataset.agent = agent.id;
    if (!detailed) card.addEventListener("click", () => this.select(agent.id));
    const head = element("header");
    const crest = element("span", "crest");
    crest.style.background = heroAccent(agent.id);
    head.append(crest, element("strong", undefined, name), element("span", "level", `Lv ${level}`));
    card.append(head, bar("HP", hp, hp > 0.5 ? "#7ee08a" : hp > 0.25 ? "#ffd35a" : "#ff6b5b"), bar("MP", mp, "#62b8ff"));
    card.append(element("p", "doing", `▶ ${DOING[agent.activity](agent.target ?? "")}`));
    if (detailed) {
      const seconds = Math.max(0, Math.floor((now - agent.since) / 1000));
      card.append(element("p", "hint", `この行動を ${Math.floor(seconds / 60)}分 ${seconds % 60}秒 つづけている`));
    }
    if (!detailed && agent.terminal) {
      const actions = element("div", "actions");
      const terminal = element("button", undefined, "▶ ターミナル");
      terminal.type = "button";
      terminal.addEventListener("click", (event) => { event.stopPropagation(); this.openTerminal(agent.terminal!); });
      actions.append(terminal);
      card.append(actions);
    } else if (!detailed) card.append(element("p", "hint", "外から来た勇者（このアプリの ターミナルでは ない）"));
    if (detailed || agentMoods.length) {
      const chips = element("p", "moods");
      for (const mood of agentMoods) chips.append(element("span", "chip", MOODS[mood]));
      if (!agentMoods.length) chips.append(element("span", "chip", "いつもどおり"));
      if (detailed) card.append(element("p", "section", "きぶん"));
      card.append(chips);
    }
    if (mp <= 0.1) card.append(element("p", "hint", "MPが のこりわずか！ きょうかいで いのる（/compact）のが よさそうだ。"));
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
    if (permission) card.append(this.permissionBlock(permission));
    const log = element("ol", "log");
    for (const entry of agent.log.slice(-LOG_SHOWN).reverse()) {
      const time = new Date(entry.at).toLocaleTimeString("ja-JP", { hour12: false });
      const outcome = entry.outcome === "ok" ? " ○" : entry.outcome === "failed" ? " ×" : "";
      log.append(element("li", entry.outcome, `${time} ${DOING[entry.activity](entry.target ?? "")}${outcome}`));
    }
    if (detailed && !agent.log.length) log.append(element("li", undefined, "まだ きろくは ありません"));
    card.append(element("p", "section", detailed ? "さいきんの きろく" : "ぼうけんの きろく"), log);
    return card;
  }

  private permissionBlock(permission: Permission, heading?: string): HTMLElement {
    const block = element("div", "permission");
    if (heading) block.append(element("h3", "section", heading));
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
// Lines about an event start with its time (shown at once, not typed), so it reads as a log.
export class Messages {
  private lines: { time: string; text: string; shown: number }[] = [];

  constructor(private readonly root: HTMLElement) {}

  say(text: string, at?: number, instant = false): void {
    const time = at === undefined ? "" : `${new Date(at).toLocaleTimeString("ja-JP", { hour12: false, hour: "2-digit", minute: "2-digit" })}  `;
    this.lines.push({ time, text, shown: instant ? text.length : 0 });
    if (this.lines.length > 4) this.lines.shift();
  }

  tick(): void {
    const typing = this.lines.find((line) => line.shown < line.text.length);
    if (typing) typing.shown = Math.min(typing.text.length, typing.shown + 2);
    const text = this.lines.filter((line) => line.shown > 0).map((line) => line.time + line.text.slice(0, line.shown)).join("\n");
    if (this.root.textContent !== text) this.root.textContent = text;
  }
}
