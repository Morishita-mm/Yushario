import { moods, type Room, type RoomAgent } from "../../core/room";
import type { AgentEvent } from "../../core/events";
import { narrate, stats } from "../../core/story";
import { compactRow, element, statusCard } from "./status-card";
import { initNameEditor } from "./names";

export type Permission = { id: string; tool: string; summary: string; agent?: string };
type Decision = "allow" | "deny" | "terminal";

// Page-local selection, status size and permission responses.
export class Status {
  readonly permissions = new Map<string, Permission>();
  private readonly signatures = new Map<string, string>();
  private picker: HTMLSelectElement | undefined;
  private pickerSignature = "";
  private readonly dialog = document.querySelector<HTMLDialogElement>("#strength-dialog")!;
  private readonly details = document.querySelector<HTMLElement>("#strength-content")!;
  private readonly sizeButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-status-size]")];
  private compact = false;
  private compactSignature = "";
  private rows: HTMLElement[] = [];
  private detailed: string | undefined;
  private detailSignature = "";
  private readonly rename: ReturnType<typeof initNameEditor>;

  constructor(
    private readonly root: HTMLElement,
    private readonly respond: (id: string, decision: Decision) => void,
    private readonly select: (agent: string | undefined) => void,
    private readonly openTerminal: (terminal: string) => void,
    namesChanged: (names: Record<string, string>) => void,
  ) {
    this.rename = initNameEditor(() => this.detailed, namesChanged);
    try { this.compact = localStorage.getItem("agent-character-status-size") === "small"; } catch { /* Page-local fallback. */ }
    const updateSize = () => { for (const button of this.sizeButtons) button.setAttribute("aria-pressed", String((button.dataset.statusSize === "small") === this.compact)); };
    updateSize();
    for (const button of this.sizeButtons) button.addEventListener("click", () => {
      this.compact = button.dataset.statusSize === "small"; updateSize();
      try { localStorage.setItem("agent-character-status-size", this.compact ? "small" : "detailed"); } catch { /* Still usable without storage. */ }
    });
    const close = () => this.closeDetails();
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

  closeDetails(): void { this.detailed = undefined; this.dialog.close(); }

  openDetails(room: Room, now: number, id: string, names: Map<string, string>): void {
    this.detailed = id; this.detailSignature = "";
    this.rename.reset(names.get(id) ?? room.agents.get(id)?.name ?? "");
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
    this.rename.available(Boolean(agent));
    const signature = agent ? this.signature(agent, now, name, undefined, true) : "departed";
    if (signature === this.detailSignature) return;
    this.detailSignature = signature;
    const scroll = this.details.scrollTop;
    this.details.replaceChildren(agent ? this.card(agent, now, name, undefined, true)
      : element("p", "hint", "この勇者は たびだちました。"));
    this.details.scrollTop = scroll;
  }

  render(room: Room, now: number, selected: string | undefined, names: Map<string, string>, project?: string): void {
    this.renderDetails(room, now, names);
    const cards: HTMLElement[] = [];
    const agents = [...room.agents.values()].filter((agent) => !this.compact || project === undefined || (agent.project ?? agent.name) === project);
    const chosen = agents.find((agent) => agent.id === selected) ?? agents[0];
    if (this.compact) {
      const signature = JSON.stringify([chosen?.id, agents.map((agent) => [agent.id, names.get(agent.id) ?? agent.name,
        agent.activity, agent.target, stats(agent, now)]), [...this.permissions.values()]]);
      if (signature !== this.compactSignature) {
        this.compactSignature = signature;
        this.rows = agents.map((agent) => compactRow(agent, now, names.get(agent.id) ?? agent.name, agent === chosen,
          [...this.permissions.values()].some((item) => (item.agent ?? "default") === agent.id), () => this.select(agent.id)));
      }
      cards.push(...this.rows);
    } else if (agents.length) {
      const signature = JSON.stringify(agents.map((agent) => [agent.id, names.get(agent.id), agent.project]));
      if (!this.picker || signature !== this.pickerSignature) {
        this.picker = element("select", "hero-picker");
        this.picker.setAttribute("aria-label", "勇者をえらぶ");
        for (const agent of agents) {
          const option = element("option", undefined, `${names.get(agent.id) ?? agent.name} — ${agent.project ?? agent.name}`);
          option.value = agent.id; this.picker.append(option);
        }
        this.picker.addEventListener("change", () => this.select(this.picker!.value));
        this.pickerSignature = signature;
      }
      this.picker.value = chosen!.id; cards.push(this.picker);
    }
    if (chosen) {
      const permission = [...this.permissions.values()].find((item) => (item.agent ?? "default") === chosen.id);
      const name = names.get(chosen.id) ?? chosen.name;
      const signature = this.signature(chosen, now, name, permission);
      let card = this.root.querySelector<HTMLElement>(`[data-agent="${CSS.escape(chosen.id)}"]`);
      if (!card || this.signatures.get(chosen.id) !== signature) {
        card = this.card(chosen, now, name, permission); this.signatures.set(chosen.id, signature);
      }
      cards.push(card);
    }
    for (const permission of this.permissions.values()) {
      const id = permission.agent ?? "default";
      if (id === chosen?.id) continue;
      const agent = room.agents.get(id), name = names.get(id) ?? agent?.name ?? id;
      const project = agent?.project ?? agent?.name;
      cards.push(this.permissionBlock(permission, project === undefined ? name : `${name} — ${project}`));
    }
    if (!cards.length) cards.push(element("p", "empty window", "まだ だれも いない ようだ…\n「しゅつじん」で Claude Code を きどうすると、ゆうしゃが まちに やってくる。"));
    if (cards.length !== this.root.children.length || cards.some((card, index) => this.root.children[index] !== card)) this.root.replaceChildren(...cards);
    for (const id of this.signatures.keys()) if (!room.agents.has(id)) this.signatures.delete(id);
  }

  private card(agent: RoomAgent, now: number, name: string, permission?: Permission, detailed = false): HTMLElement {
    return statusCard(agent, moods(agent, now), permission && this.permissionBlock(permission), now, name, detailed,
      () => this.select(agent.id), this.openTerminal);
  }

  private permissionBlock(permission: Permission, heading?: string): HTMLElement {
    const block = element("div", "permission");
    if (heading) block.append(element("h3", "section", heading));
    block.append(element("p", undefined, `「${permission.summary}」\nを おこなっても よいですか？`));
    const actions = element("div", "actions");
    for (const [label, decision] of [["はい", "allow"], ["いいえ", "deny"], ["ターミナルで こたえる", "terminal"]] as const) {
      const button = element("button", undefined, `▶ ${label}`); button.type = "button";
      button.addEventListener("click", (event) => { event.stopPropagation(); this.respond(permission.id, decision); });
      actions.append(button);
    }
    block.append(actions); return block;
  }
}

// Recent narration keeps the hero ID so renaming also updates already-visible lines.
export class Messages {
  private lines: { time: string; text: string; shown: number; event?: AgentEvent; hero?: { id: string; name: string } }[] = [];
  constructor(private readonly root: HTMLElement, private readonly name: (id: string) => string | undefined) {}

  say(text: string, at?: number, instant = false, hero?: { id: string; name: string }): void {
    const time = at === undefined ? "" : `${new Date(at).toLocaleTimeString("ja-JP", { hour12: false, hour: "2-digit", minute: "2-digit" })}  `;
    this.lines.push({ time, text, shown: instant ? text.length : 0, hero });
    if (this.lines.length > 4) this.lines.shift();
  }

  event(event: AgentEvent, at: number, instant = false): void {
    const text = narrate({ ...event, name: this.name(event.agent ?? "default") ?? event.name });
    if (!text) return;
    this.say(text, at, instant); this.lines[this.lines.length - 1]!.event = event;
  }

  tick(): void {
    for (const line of this.lines) {
      const text = line.event ? narrate({ ...line.event, name: this.name(line.event.agent ?? "default") ?? line.event.name })!
        : line.hero ? line.text.replace(line.hero.name, this.name(line.hero.id) ?? line.hero.name) : line.text;
      if (text !== line.text) {
        if (line.shown >= line.text.length) line.shown = text.length;
        line.text = text;
        if (line.hero) line.hero.name = this.name(line.hero.id) ?? line.hero.name;
      }
    }
    const typing = this.lines.find((line) => line.shown < line.text.length);
    if (typing) typing.shown = Math.min(typing.text.length, typing.shown + 2);
    const text = this.lines.filter((line) => line.shown > 0).map((line) => line.time + line.text.slice(0, line.shown)).join("\n");
    if (this.root.textContent !== text) this.root.textContent = text;
  }
}
