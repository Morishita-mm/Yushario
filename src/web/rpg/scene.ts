import { tr } from "../language";
import { townKey, townNameForKey, type TownTheme } from "../../core/town-ledger";
import type { Room } from "../../core/room";
import type { EquipmentTiers } from "../../core/battle-presentation";
import { townView, type HeroPlace, type TownHero, type TownNames } from "../../core/town";
import { Ambient, type Theme } from "../town/ambient";
import { HeroTravel } from "./travel";
import { drawFocus } from "../town/battle";
import { openBattleCommands, openHeroCommands } from "./hero-commands";
import { Following } from "./following";
import { drawField } from "../town/field";
import { showArchivedTowns, showThemeChooser, showTownList } from "../town/herald";
import { drawInn } from "../town/inn";
import { drawChurch, PRIEST_LINES } from "../town/church";
import { heroVariant } from "../town/appearance";
import { Sheets } from "../town/sheets";
import { drawNavigation } from "../town/navigation";
import { drawTown, TOWN_H, TOWN_W } from "../town/town";
import { drawWorld, markers, plate, regionName, sleeping, type Project } from "../town/world";
import { patchTown, type TownChange, type TownRecord } from "./ledger";
import { showSettings } from "./settings";
import { fights, focus, battleSlots } from "./battles";
import { updateMapNav } from "./navigation";
import { localHotspots } from "./map-hotspots";
import { archivedTownProjects, townProjects } from "./town-projects";
import { drawReportSigns, reportSigns } from "./report-signs";
import { drawNoticeArrow, NoticeMark } from "../town/notice-mark";
type Place = "world" | HeroPlace;
type Hot = { x: number; y: number; w: number; h: number; text?: string; act: () => void };
// Page-local drawing state only. Room remains the source of agent state.
export class Scene {
  selected: string | undefined;
  openQuests: () => void = () => undefined;
  townName = (key: string): string => this.towns.get(key)?.label ?? townNameForKey(key, this.records);
  get currentTown(): string | undefined { return this.place === "world" ? undefined : this.project; }
  get projects(): Project[] { return [...this.towns.values()]; }
  get followedId(): string | undefined { return this.following.heroId; }
  readonly names = new Map<string, string>();
  readonly savedNames = new Map<string, string>();
  private history: TownNames = [];
  private heroes: TownHero[] = [];
  private towns = new Map<string, Project>();
  private readonly foreignLooks = new Map<string, TownTheme>(); // Ledger themes live only in records.
  private records: TownRecord[] = [];
  private list: "sleeping" | "archived" | TownTheme | undefined; private listContent = "";
  readonly art = new Sheets();
  private readonly travel = new HeroTravel(this.art, (project) => this.look(project));
  private readonly ctx: CanvasRenderingContext2D;
  private place: Place = "world"; private project: string | undefined;
  private focused: string | undefined; private ambient: Ambient | undefined;
  private gateMenu = false; private priestLine = 0;
  private sleepingPlate = { x: 0, y: 0, w: 0, h: 0 }; private archivedPlate = { x: 0, y: 0, w: 0, h: 0 };
  private pointer: [number, number] = [-1, -1]; private last = 0;
  private flashAt = -Infinity; private flashWhite = false;
  private readonly following: Following;
  private closeCommands: ReturnType<typeof openHeroCommands> | undefined;
  private commanding: string | undefined;
  private readonly noticeMark = new NoticeMark();

  constructor(private readonly canvas: HTMLCanvasElement, private readonly layer: HTMLElement,
    private readonly talk: (id: string, at?: number) => void, private readonly terminal: (id: string) => void, private readonly status: (id: string) => void,
    private readonly say: (text: string, at: number) => void, private readonly actions: (id: string) => Parameters<typeof openHeroCommands>[7],
    private readonly gear: (terminal?: string) => EquipmentTiers) {
    this.following = new Following(say);
    this.ctx = canvas.getContext("2d")!;
    canvas.addEventListener("mousemove", (event) => {
      this.pointer = this.point(event);
      canvas.style.cursor = this.hit(...this.pointer) ? "pointer" : "default";
    });
    canvas.addEventListener("click", (event) => {
      const hot = this.hit(...this.point(event));
      if (hot) hot.act(); else this.gateMenu = false;
    });
    layer.addEventListener("click", (event) => {
      if (event.target !== layer) return;
      this.closeCommands?.(); layer.hidden = true;
      if (this.focused) this.go(this.place); // Outside the battle commands: back to the field.
    });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !event.isComposing) { this.closeCommands?.(); layer.hidden = true; } });
    document.querySelector("#world-back")!.addEventListener("click", () => this.go("world"));
    document.querySelector("#settings")!.addEventListener("click", () => { this.closeCommands?.(); this.list = undefined; showSettings(layer, this.currentTown); });
    const pin = document.querySelector<HTMLButtonElement>("#town-pin")!;
    pin.addEventListener("click", () => {
      const town = this.records.find((record) => townKey(record) === this.project);
      if (!town) return;
      pin.disabled = true;
      void this.changeTown(townKey(town), { pinned: !town.pinned }).finally(() => { pin.disabled = false; });
    });
    document.querySelector("#town-look")!.addEventListener("click", () => {
      const town = this.project === undefined ? undefined : this.towns.get(this.project);
      if (town) this.chooseLook(town); else this.go("world");
    });
  }
  async load(): Promise<void> { await this.art.load(); await document.fonts.load('10px "DotGothic16"'); }
  sync(room: Room, now: number, replaying = false): void {
    const view = townView(room, now, this.history);
    this.history = view.names;
    for (const entry of view.names) this.names.set(entry.id, this.savedNames.get(entry.id) ?? entry.name);
    this.heroes = view.projects.flatMap((town) => town.heroes.map((hero) => ({ ...hero, name: this.names.get(hero.id) ?? hero.name })));
    this.rebuildTowns();
    if (!replaying && this.list && !this.layer.hidden) this.openList(this.list);
    // Replay first rebuilds naming/town history; validate navigation only against the final Room.
    if (replaying) return;
    const followed = this.following.target(this.heroes, this.project, this.place, this.focused, now);
    const town = followed && this.towns.get(followed.project);
    if (followed && town) { this.selected = followed.id; this.enter(town, followed.place, followed); }
    if (this.place !== "world" && (this.project === undefined || !this.towns.has(this.project))) {
      this.project = undefined;
      this.go("world");
    }
    this.travel.sync(this.heroes, this.gear);
    if (this.commanding) this.closeCommands?.update(this.actions(this.commanding).working);
    if (this.selected && !room.agents.has(this.selected)) this.selected = undefined;
    if (!this.selected) this.selected = this.localHeroes()[0]?.id;
    if (this.commanding && (this.layer.hidden || !this.localHeroes().some((h) => h.id === this.commanding && h.place === this.place))) this.closeCommands?.();
    if (this.focused) {
      const hero = this.heroes.find((h) => h.id === this.focused);
      if (!hero?.monster || hero.place !== this.place) this.go(hero?.place ?? this.place, true);
    }
  }
  setTowns(towns: TownRecord[]): void {
    this.records = towns;
    for (const town of towns) this.foreignLooks.delete(townKey(town));
    this.rebuildTowns();
    if (this.list && !this.layer.hidden) this.openList(this.list);
  }
  private look(name: string): TownTheme | undefined {
    const record = this.records.find((town) => townKey(town) === name);
    return record ? record.theme : this.foreignLooks.get(name);
  }
  private rebuildTowns(): void { this.towns = townProjects(this.records, this.heroes, (name) => this.look(name)); }
  private async changeTown(name: string, change: TownChange): Promise<boolean> {
    const feedback = document.querySelector<HTMLElement>("#town-feedback")!;
    try {
      const town = await patchTown(name, change);
      this.setTowns(this.records.map((record) => townKey(record) === townKey(town) ? town : record));
      feedback.hidden = true;
      return true;
    } catch {
      feedback.textContent = tr("町の台帳に ほぞんできませんでした。もういちど おためしください。", "Could not save the town. Try again.");
      feedback.hidden = false;
      return false;
    }
  }
  private openList(kind: "sleeping" | "archived" | TownTheme): void {
    const towns = [...this.towns.values()];
    const projects = kind === "archived" ? archivedTownProjects(this.records) : kind === "sleeping" ? sleeping(towns) : towns.filter((town) => town.heroes > 0 && town.theme === kind);
    const content = JSON.stringify(projects);
    if (this.list === kind && !this.layer.hidden && this.listContent === content) return;
    this.list = kind; this.listContent = content;
    const close = () => { this.list = undefined; };
    if (kind === "archived") showArchivedTowns(this.layer, projects, async (town) => { await this.changeTown(town.repo, { archived: false }); }, close);
    else showTownList(this.layer, kind === "sleeping" ? tr("ねむっている町", "Sleeping towns") : tr(`${regionName(kind)}の 町（${projects.length}）`, `${regionName(kind)} towns (${projects.length})`), projects,
      (town) => this.enter(town), close, kind === "sleeping" ? async (town) => { await this.changeTown(town.repo, { pinned: !town.pinned }); } : undefined);
  }
  expectArrival(terminal: string): void { this.travel.expect(terminal, this.heroes); }
  prepareDeparture(id: string): () => void {
    const hero = this.heroes.find((item) => item.id === id), town = hero && this.towns.get(hero.project);
    if (!hero || !town) return () => undefined;
    const start = this.travel.prepare(hero);
    return () => { this.following.stop(); this.closeCommands?.(); start(); this.enter(town); };
  }
  enterTown(project: string, entered: () => void): void {
    const town = this.towns.get(project);
    // Closing the town look chooser must not hide the launched hero's guidance (e.g. an early exit).
    if (town) this.enter(town, "town", undefined, entered, entered);
  }
  visitNotice(project: string, id?: string, at?: number): void {
    this.selected = id;
    const hero = this.heroes.find((h) => h.id === id), town = this.towns.get(project);
    if (town) this.enter(town, hero?.place ?? "town", undefined, () => {
      this.noticeMark.start(id, performance.now());
      if (id && at !== undefined) this.talk(id, at);
    });
  }
  select(id: string | undefined, commands = false): void {
    this.selected = id;
    const hero = this.heroes.find((h) => h.id === id);
    const town = hero && this.towns.get(hero.project);
    if (hero && town) this.enter(town, hero.place, undefined, commands
      ? () => this.commands(hero.id, this.size()[0] / 2, this.size()[1] / 2, hero.monster ? () => this.go(hero.place, false, hero.id) : undefined) : undefined);
  }
  private localHeroes(): TownHero[] { return this.heroes.filter((hero) => hero.project === this.project); }
  private go(place: Place, automatic = false, focused?: string): void {
    this.noticeMark.clear();
    if (!automatic) this.following.stop();
    this.closeCommands?.();
    this.flashWhite = Boolean(this.focused || focused); this.flashAt = performance.now();
    this.place = place; this.focused = focused; this.gateMenu = false;
    this.ambient = focused ? new Ambient(this.art, place as Theme, `bg-battle-${place}`) : undefined;
    this.layer.hidden = true; this.list = undefined;
    if (focused && !automatic) this.battleCommands();
  }
  // Clicking the party opens the commands; anywhere else returns to the field.
  private battleCommands(): void {
    const hero = this.heroes.find((h) => h.id === this.focused), size = this.size();
    if (!hero) return;
    this.closeCommands?.(); this.commanding = hero.id;
    this.closeCommands = openBattleCommands(this.layer, this.canvas, size, hero.name, size[0] - 8, size[1] - 50, this.actions(hero.id),
      { back: () => this.go(this.place), closed: () => { this.closeCommands = undefined; this.commanding = undefined; } });
  }
  private enter(project: Project, place: HeroPlace = "town", followed?: TownHero, entered?: () => void, skipped?: () => void): void {
    if (!this.look(project.repo)) { this.go("world", Boolean(followed)); this.chooseLook(project, place, followed, entered, skipped); return; }
    this.project = project.repo;
    this.selected = this.heroes.find((hero) => hero.project === project.repo && hero.id === this.selected)?.id
      ?? this.heroes.find((hero) => hero.project === project.repo)?.id;
    this.go(place, Boolean(followed), followed?.monster ? followed.id : undefined);
    entered?.();
  }
  private chooseLook(project: Project, place: HeroPlace = "town", followed?: TownHero, entered?: () => void, skipped?: () => void): void {
    this.closeCommands?.(); this.list = undefined;
    showThemeChooser(this.layer, project, this.art, (theme) => {
      void (async () => {
        if (this.records.some((record) => townKey(record) === project.repo)) {
          if (!await this.changeTown(project.repo, { theme })) return;
        } else { this.foreignLooks.set(project.repo, theme); this.rebuildTowns(); }
        this.enter(this.towns.get(project.repo) ?? { ...project, theme }, place, followed, entered);
      })();
    }, () => skipped?.());
  }
  private commands(id: string, x: number, y: number, watch?: () => void): void {
    this.noticeMark.clear(id);
    this.closeCommands?.();
    const hero = this.heroes.find((h) => h.id === id);
    if (!hero) return;
    this.selected = this.commanding = id;
    this.closeCommands = openHeroCommands(this.layer, this.canvas, this.size(), hero.name, this.travel.walkers.find((w) => w.id === id), x, y, this.actions(id), {
      talk: () => this.talk(id), status: () => { this.selected = id; this.status(id); }, watch,
      follow: () => { this.following.start(hero); this.go(hero.place, true, hero.monster ? id : undefined); },
      terminal: hero.agent.terminal ? () => this.terminal(hero.agent.terminal!) : undefined,
      closed: () => { this.closeCommands = undefined; this.commanding = undefined; },
    });
  }
  private size(): [number, number] {
    if (this.focused) return this.art.size(`bg-battle-${this.place}`);
    return this.place === "world" ? this.art.size("world-map") : [TOWN_W, TOWN_H];
  }
  private signs() { return reportSigns(this.art, this.localHeroes(), this.travel.walkers, this.place); }
  private hotspots(): Hot[] {
    if (!this.layer.hidden) return [];
    const reports = this.signs().map((sign) => ({ x: sign.x - 18, y: sign.y - 42, w: 50, h: 46,
      act: () => { this.noticeMark.clear(sign.id); this.selected = sign.id; this.talk(sign.id, sign.at); } }));
    const [w, h] = this.size();
    if (this.focused) return [...reports, { x: w / 2 - 130, y: h - 112, w: 260, h: 66, act: () => this.battleCommands() },
      { x: 0, y: 0, w, h, act: () => this.go(this.place) }];
    if (this.place === "world") {
      const towns = [...this.towns.values()];
      return [...markers(this.art, w, h, towns).map((marker) => ({ x: marker.x - 34, y: marker.y - 22, w: 68, h: 60, act: () => {
        if (marker.projects.length > 1) this.openList(marker.theme);
        else this.enter(marker.projects[0]);
      } })), { ...this.sleepingPlate, act: () => this.openList("sleeping") },
        { ...this.archivedPlate, act: () => this.openList("archived") }];
    }
    return [...reports, ...localHotspots(this.art, this.place, this.localHeroes(), this.travel.walkers, this.gateMenu,
      (place, focused) => this.go(place, false, focused),
      (id, x, y, watch) => this.commands(id, x, y, watch), () => { this.gateMenu = true; },
      () => { const line = PRIEST_LINES[this.priestLine++ % PRIEST_LINES.length]; this.say(tr(`神父さま「${line}」`, `Priest: "${line}"`), Date.now()); }, this.project ? this.look(this.project) : undefined, this.openQuests)];
  }
  private point(event: MouseEvent): [number, number] {
    const rect = this.canvas.getBoundingClientRect(), [w, h] = this.size();
    return [(event.clientX - rect.left) * w / rect.width, (event.clientY - rect.top) * h / rect.height];
  }
  private hit(x: number, y: number): Hot | undefined { return this.hotspots().find((s) => x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h); }
  frame(time: number, now: number): void {
    const displayName = this.project ? this.townName(this.project) : undefined;
    const theme = this.project === undefined ? undefined : this.look(this.project);
    if (this.place !== "world" && !theme) {
      const place = this.place, town = this.project && this.towns.get(this.project);
      this.go("world");
      if (town) this.chooseLook(town, place);
    }
    const dt = Math.min(100, time - this.last); this.last = time;
    this.travel.step(time, dt);
    const [w, h] = this.size(), ctx = this.ctx;
    if (this.canvas.width !== w * 2 || this.canvas.height !== h * 2) { this.canvas.width = w * 2; this.canvas.height = h * 2; }
    ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.imageSmoothingEnabled = false;
    const local = this.localHeroes(), hero = local.find((h) => h.id === this.focused);
    const notice = this.noticeMark.frame(time, local, this.place);
    if (hero && this.ambient) {
      drawFocus(ctx, this.art, focus(hero, now, this.gear(hero.agent.terminal)), this.ambient, time, dt, w, h);
    } else if (this.place === "world") {
      this.sleepingPlate = drawWorld(ctx, this.art, time, w, h, [...this.towns.values()]);
      const archived = this.records.filter((town) => town.archivedAt !== undefined).length;
      this.archivedPlate = archived ? plate(ctx, [[tr(`しまった町 ${archived}`, `ARCHIVED TOWNS ${archived}`), "#c9c3dc", 9]], 68, h - 24) : { x: -1, y: -1, w: 0, h: 0 };
    }
    else if (this.place === "town") drawTown(ctx, this.art, time, {
      sleepers: local.filter((h) => h.place === "inn").length, prayers: local.filter((h) => h.place === "church").length, theme: theme!, name: this.townName(this.project!),
      walkers: this.travel.local(this.project, local), notice,
    });
    else if (this.place === "inn") drawInn(ctx, this.art, time, local.filter((h) => h.place === "inn").map((h) => ({ id: h.id, name: h.name, branch: h.agent.branch, ...this.gear(h.agent.terminal) })), notice, displayName);
    else if (this.place === "church") drawChurch(ctx, this.art, time, local.filter((h) => h.place === "church").map((h) => ({ id: h.id, name: h.name, branch: h.agent.branch, variant: heroVariant(h.id), ...this.gear(h.agent.terminal) })), notice, displayName);
    else drawField(ctx, this.art, this.place, time, fights(this.art, local.filter((h) => h.place === this.place), now, this.gear), undefined, Math.max(0, local.filter((h) => h.place === this.place).length - battleSlots(this.art, this.place).length), notice, displayName);
    drawReportSigns(ctx, this.art, time, this.signs(), notice);
    drawNoticeArrow(ctx, notice);
    drawNavigation(ctx, this.hotspots(), this.pointer, this.gateMenu);
    if (time - this.flashAt < 300) { ctx.fillStyle = `rgba(${this.flashWhite ? "255,255,255" : "0,0,0"},${1 - (time - this.flashAt) / 300})`; ctx.fillRect(0, 0, w, h); }
    const title = updateMapNav(this.place, this.project ? this.townName(this.project) : undefined, this.records.find((town) => townKey(town) === this.project)?.pinned);
    this.canvas.setAttribute("aria-label", tr(`${title}。${local.map((h) => `${h.name}: ${h.place}`).join("、")}`, `${title}. ${local.map((h) => `${h.name}: ${h.place}`).join(", ")}`));
  }
}
