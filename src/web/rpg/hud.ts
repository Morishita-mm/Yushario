import { clock, language, tr } from "../language";
import { moods, type Room, type RoomAgent } from "../../core/room";
import type { AgentEvent } from "../../core/events";
import { narrate, stats } from "../../core/story";
import { compactRow, element, statusCard } from "./status-card";
import { initNameEditor } from "./names";
import { renderPartyList } from "../town/party-list";
import { filterHeroes, stateCounts } from "../../core/hero-search";
import { heroSearch } from "./hero-search";
import { heroBrief } from "./hero-brief";
import { townNameForKey } from "../../core/town-ledger";
import { interruptStatus } from "./interrupt-status";

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
  private last: Parameters<Status["render"]> | undefined;
  private readonly search = heroSearch(() => { this.listSignature = ""; if (this.last) this.render(...this.last); });
  private detailed: string | undefined;
  // The hero whose brief is open under its row; none at first. A new selection (row or map) opens it.
  private briefOpen: string | undefined;
  private lastSelected: string | undefined;
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
    private readonly townName: (key: string) => string = (key) => townNameForKey(key, []),
    private readonly review?: (id: string) => void,
    private readonly gear?: (terminal?: string) => string,
    private readonly talk?: (id: string) => void,
    private readonly membership?: (terminal?: string) => string | undefined,
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

  // Redraw the list when something outside the room changed (which quest a hero is in).
  refresh(): void { this.listSignature = ""; if (this.last) this.render(...this.last); }
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
    return JSON.stringify([name, agent.branch, agent.activity, agent.target, interruptStatus(agent, now), moods(agent, now), stats(agent, now),
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
    this.last = [room, now, selected, names, project];
    this.renderDetails(room, now, names);
    const cards: HTMLElement[] = [];
    for (const [id, permission] of this.permissions) if (permission.expiresAt <= now) this.permissions.delete(id);
    for (const id of this.permissionBlocks.keys()) if (!this.permissions.has(id)) this.permissionBlocks.delete(id);
    const waiting = (id: string) => [...this.permissions.values()].some((item) => (item.agent ?? "default") === id);
    // One filter for a town and the world map: the town chip (inside a town), words, and state.
    const everyone = [...room.agents.values()].map((agent) => ({ agent, id: agent.id, town: agent.project ?? agent.name, name: names.get(agent.id) ?? agent.name,
      townName: this.townName(agent.project ?? agent.name), branch: agent.branch, activity: agent.activity, waiting: waiting(agent.id) }));
    const filter = this.search.filter(project), agents = filterHeroes(everyone, filter).map((hero) => hero.agent);
    this.search.render(project, project === undefined ? undefined : this.townName(project), stateCounts(everyone, filter));
    this.counted(filterHeroes(everyone, { town: filter.town, query: "", state: "all" }).length);
    if (selected !== this.lastSelected) { this.lastSelected = selected; this.briefOpen = selected; }
    const chosen = agents.find((agent) => agent.id === this.briefOpen);
    const chosenPermission = [...this.permissions.values()].find((item) => (item.agent ?? "default") === chosen?.id);
    const signature = JSON.stringify([chosen && this.signature(chosen, now, names.get(chosen.id) ?? chosen.name, chosenPermission), Math.floor(now / 60_000),
      agents.map((agent) => [agent.id, names.get(agent.id) ?? agent.name, agent.project, this.townName(agent.project ?? agent.name), agent.branch,
        agent.activity, agent.target, interruptStatus(agent, now), stats(agent, now), waiting(agent.id), this.gear?.(agent.terminal), this.membership?.(agent.terminal)]), selected]);
    if (signature !== this.listSignature) {
      this.listSignature = signature;
      renderPartyList(this.list, agents, (agent) => compactRow(agent, now, names.get(agent.id) ?? agent.name,
        agent.id === selected, waiting(agent.id), () => this.pick(agent.id), this.gear?.(agent.terminal), this.membership?.(agent.terminal)), this.townName,
        (agent) => agent === chosen ? this.brief(agent, now, names, chosenPermission, room) : undefined);
      if (!agents.length) this.list.append(element("p", "hint", everyone.length ? tr("見つからない。言葉や 町の札を 変えてみて", "No match. Try other words or remove the town chip") : tr("まだ だれも いない ようだ…", "No heroes here yet…")));
    }
    cards.push(this.search.root, this.list);
    for (const permission of this.permissions.values()) {
      const id = permission.agent ?? "default";
      if (permission.id === chosenPermission?.id) continue;
      const agent = room.agents.get(id), name = names.get(id) ?? agent?.name ?? id;
      const project = agent?.project ?? agent?.name;
      cards.push(this.permissionBlock(permission, project === undefined ? name : `${name} — ${this.townName(project)}`, agent?.terminal));
    }

    if (cards.length !== this.root.children.length || cards.some((card, index) => this.root.children[index] !== card)) this.root.replaceChildren(...cards);
    for (const timer of this.root.querySelectorAll<HTMLElement>(".permission-time")) {
      const seconds = Math.max(0, Math.ceil((Number(timer.dataset.expires) - now) / 1000));
      timer.textContent = tr(`のこり ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`, `Time left ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`);
    }
    for (const id of this.signatures.keys()) if (!room.agents.has(id)) this.signatures.delete(id);
  }

  // A closed hero: go to it on the map with the arrow and open its brief. The open hero: close the brief only.
  private pick(id: string): void {
    if (this.briefOpen === id) { this.briefOpen = undefined; this.listSignature = ""; if (this.last) this.render(...this.last); return; }
    this.briefOpen = id; this.listSignature = ""; this.commands(id);
    if (this.last) this.render(...this.last);
  }

  // The chosen hero, opened under its row: what it is doing, gear, a permission prompt, and actions.
  private brief(agent: RoomAgent, now: number, names: Map<string, string>, permission: Permission | undefined, room: Room): HTMLElement {
    return heroBrief(agent, now, this.gear?.(agent.terminal), permission && this.permissionBlock(permission, undefined, agent.terminal), {
      talk: this.talk && agent.terminal ? () => this.talk!(agent.id) : undefined,
      terminal: agent.terminal ? () => this.openTerminal(agent.terminal!) : undefined,
      review: this.review && agent.terminal ? () => this.review!(agent.id) : undefined,
      details: () => this.openDetails(room, Date.now(), agent.id, names),
    });
  }
  private card(agent: RoomAgent, now: number, name: string, permission?: Permission, detailed = false): HTMLElement {
    return statusCard(agent, moods(agent, now), permission && this.permissionBlock(permission, undefined, agent.terminal), now, name, detailed,
      () => this.select(agent.id), this.openTerminal, this.equipment(agent.terminal), this.review && (() => this.review!(agent.id)));
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
