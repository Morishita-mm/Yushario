import { clock, language, tr } from "../language";
import { moods, type Room, type RoomAgent } from "../../core/room";
import type { AgentEvent } from "../../core/events";
import { narrate, stats } from "../../core/story";
import { compactRow, element, statusCard } from "./status-card";
import { initNameEditor } from "./names";

export type Permission = { id: string; tool: string; summary: string; content: string; omitted: number; expiresAt: number; agent?: string; helper?: string };
type Decision = "allow" | "deny" | "terminal";

// Page-local selection, status size and permission responses.
export class Status {
  readonly permissions = new Map<string, Permission>();
  private readonly signatures = new Map<string, string>();
  private readonly permissionBlocks = new Map<string, { signature: string; block: HTMLElement }>();
  private readonly dialog = document.querySelector<HTMLDialogElement>("#strength-dialog")!;
  private readonly details = document.querySelector<HTMLElement>("#strength-content")!;
  private readonly list = element("div", "party-list");
  private listSignature = "";
  private detailed: string | undefined;
  private detailSignature = "";
  private readonly rename: ReturnType<typeof initNameEditor>;

  constructor(
    private readonly root: HTMLElement,
    private readonly respond: (id: string, decision: Decision) => void,
    private readonly select: (agent: string | undefined) => void,
    private readonly openTerminal: (terminal: string) => void,
    namesChanged: (names: Record<string, string>) => void,
    private readonly commands: (id: string) => void,
    private readonly equipment: (terminal?: string) => string[],
    private readonly counted: (n: number) => void,
  ) {
    this.rename = initNameEditor(() => this.detailed, namesChanged);
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
      agent.tasks, agent.helpers, agent.terminal, permission, agent.log, this.equipment(agent.terminal),
      detailed ? Math.max(0, Math.floor((now - agent.since) / 1000)) : undefined]);
  }

  private renderDetails(room: Room, now: number, names: Map<string, string>): void {
    if (!this.detailed) return;
    const agent = room.agents.get(this.detailed);
    const name = names.get(this.detailed) ?? agent?.name ?? this.detailed;
    document.querySelector<HTMLElement>("#strength-title")!.textContent = tr(`${name}の つよさ`, `${name}'s status`);
    this.rename.available(Boolean(agent));
    const signature = agent ? this.signature(agent, now, name, undefined, true) : "departed";
    if (signature === this.detailSignature) return;
    this.detailSignature = signature;
    const scroll = this.details.scrollTop;
    this.details.replaceChildren(agent ? this.card(agent, now, name, undefined, true)
      : element("p", "hint", tr("この勇者は たびだちました。", "This hero has set off.")));
    this.details.scrollTop = scroll;
  }

  render(room: Room, now: number, selected: string | undefined, names: Map<string, string>, project?: string): void {
    this.renderDetails(room, now, names);
    const cards: HTMLElement[] = [];
    for (const [id, permission] of this.permissions) if (permission.expiresAt <= now) this.permissions.delete(id);
    for (const id of this.permissionBlocks.keys()) if (!this.permissions.has(id)) this.permissionBlocks.delete(id);
    // Inside a town only its heroes; on the world map everyone, grouped by town.
    const agents = [...room.agents.values()].filter((agent) => project === undefined || (agent.project ?? agent.name) === project);
    const chosen = agents.find((agent) => agent.id === selected) ?? agents[0];
    this.counted(agents.length);
    const waiting = (id: string) => [...this.permissions.values()].some((item) => (item.agent ?? "default") === id);
    const signature = JSON.stringify([chosen?.id, agents.map((agent) => [agent.id, names.get(agent.id) ?? agent.name, agent.project,
      agent.activity, agent.target, stats(agent, now), waiting(agent.id)])]);
    if (signature !== this.listSignature) {
      this.listSignature = signature;
      const towns = new Map<string, RoomAgent[]>();
      for (const agent of agents) towns.set(agent.project ?? agent.name, [...(towns.get(agent.project ?? agent.name) ?? []), agent]);
      this.list.replaceChildren(...[...towns].sort(([a], [b]) => a.localeCompare(b)).flatMap(([town, members]) => [
        element("h3", "party-town", tr(`${town}（${members.length}人）`, `${town} (${members.length} heroes)`)),
        ...members.map((agent) => compactRow(agent, now, names.get(agent.id) ?? agent.name, agent === chosen, waiting(agent.id), () => this.commands(agent.id))),
      ]));
    }
    if (agents.length) cards.push(this.list);
    const chosenPermission = [...this.permissions.values()].find((item) => (item.agent ?? "default") === chosen?.id);
    if (chosen) {
      const permission = chosenPermission;
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
      if (permission.id === chosenPermission?.id) continue;
      const agent = room.agents.get(id), name = names.get(id) ?? agent?.name ?? id;
      const project = agent?.project ?? agent?.name;
      cards.push(this.permissionBlock(permission, project === undefined ? name : `${name} — ${project}`, agent?.terminal));
    }
    if (!cards.length) cards.push(element("p", "empty window", tr("まだ だれも いない ようだ…", "No heroes here yet…")));
    if (cards.length !== this.root.children.length || cards.some((card, index) => this.root.children[index] !== card)) this.root.replaceChildren(...cards);
    for (const timer of this.root.querySelectorAll<HTMLElement>(".permission-time")) {
      const seconds = Math.max(0, Math.ceil((Number(timer.dataset.expires) - now) / 1000));
      timer.textContent = tr(`のこり ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`, `Time left ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`);
    }
    for (const id of this.signatures.keys()) if (!room.agents.has(id)) this.signatures.delete(id);
  }

  private card(agent: RoomAgent, now: number, name: string, permission?: Permission, detailed = false): HTMLElement {
    return statusCard(agent, moods(agent, now), permission && this.permissionBlock(permission, undefined, agent.terminal), now, name, detailed,
      () => this.select(agent.id), this.openTerminal, this.equipment(agent.terminal));
  }

  private permissionBlock(permission: Permission, heading?: string, terminal?: string): HTMLElement {
    const signature = JSON.stringify([permission, heading, terminal]);
    const cached = this.permissionBlocks.get(permission.id);
    if (cached?.signature === signature) return cached.block;
    const block = element("div", "permission"); block.dataset.permission = permission.id;
    if (heading) block.append(element("h3", "section", heading));
    if (permission.helper) block.append(element("p", "hint", tr(`なかま：${permission.helper}`, `Ally: ${permission.helper}`)));
    block.append(element("p", undefined, tr(`${permission.tool}を おこなっても よいですか？`, `Allow ${permission.tool}?`)),
      element("pre", "permission-content", permission.content));
    if (permission.omitted) block.append(element("p", "hint", tr(`…（のこり ${permission.omitted}文字は ターミナルで）`, `… (${permission.omitted} more characters in the terminal)`)));
    const timer = element("p", "permission-time"); timer.dataset.expires = String(permission.expiresAt); block.append(timer);
    const actions = element("div", "actions");
    for (const [label, decision] of [[tr("はい", "Yes"), "allow"], [tr("いいえ", "No"), "deny"], [tr("ターミナルで こたえる", "Answer in terminal"), "terminal"]] as const) {
      const button = element("button", undefined, `▶ ${label}`); button.type = "button";
      button.disabled = decision === "allow" && permission.omitted > 0;
      button.addEventListener("click", (event) => {
        event.stopPropagation(); this.respond(permission.id, decision);
        if (decision === "terminal" && terminal) this.openTerminal(terminal);
      });
      actions.append(button);
    }
    block.append(actions);
    this.permissionBlocks.set(permission.id, { signature, block });
    return block;
  }
}

// Recent narration keeps the hero ID so renaming also updates already-visible lines.
export class Messages {
  private lines: { time: string; text: string; shown: number; event?: AgentEvent; previousContext?: number; hero?: { id: string; name: string } }[] = [];
  constructor(private readonly root: HTMLElement, private readonly name: (id: string) => string | undefined) {}

  say(text: string, at?: number, instant = false, hero?: { id: string; name: string }): void {
    const time = at === undefined ? "" : `${clock(at)}  `;
    this.lines.push({ time, text, shown: instant ? text.length : 0, hero });
    if (this.lines.length > 4) this.lines.shift();
  }

  event(event: AgentEvent, at: number, instant = false, previousContext?: number): void {
    const text = narrate({ ...event, name: this.name(event.agent ?? "default") ?? event.name }, previousContext, language);
    if (!text) return;
    this.say(text, at, instant);
    const line = this.lines[this.lines.length - 1]!;
    line.event = event; line.previousContext = previousContext;
  }

  tick(): void {
    for (const line of this.lines) {
      const text = line.event ? narrate({ ...line.event, name: this.name(line.event.agent ?? "default") ?? line.event.name }, line.previousContext, language)!
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
