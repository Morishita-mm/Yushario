import type { Room } from "../../core/room";
import { JOB_NAMES, stats } from "../../core/story";
import { townView, type HeroPlace, type TownHero, type TownNames } from "../../core/town";
import { Ambient, type Theme } from "../town/ambient";
import { heroVariant } from "../town/appearance";
import { drawFocus, type Focus } from "../town/battle";
import { drawField, FIELD_EXITS, label, type Fight } from "../town/field";
import { showArchivedTowns, showThemeChooser, showTownList } from "../town/herald";
import { drawInn } from "../town/inn";
import { Sheets } from "../town/sheets";
import { drawNavigation } from "../town/navigation";
import type { TownTheme } from "../town/themes";
import { drawTown, TOWN_H, TOWN_SPOTS, TOWN_W } from "../town/town";
import { makeWalker, stepWalkers, type Walker } from "../town/walkers";
import { drawWorld, markers, plate, regionName, sleeping, type Project } from "../town/world";
import { patchTown, type TownChange, type TownRecord } from "./ledger";
import { showSettings } from "./settings";

type Place = "world" | HeroPlace;
type Hot = { x: number; y: number; w: number; h: number; text?: string; act: () => void };
const SLOTS: [number, number][] = [[250, 210], [560, 190], [360, 430], [640, 440]];
const MONSTER_NAMES = { slime: "スライム", golem: "ゴーレム", ghost: "おばけ", dragon: "ドラゴン" };
const FX = { slime: 2, golem: 8, ghost: 6, dragon: 4 };
const FIELD_NAMES = { meadow: "そうげん", cave: "どうくつ", forest: "よるのもり" };

// Page-local drawing state only. Room remains the source of agent state.
export class Scene {
  selected: string | undefined;
  readonly names = new Map<string, string>();
  private history: TownNames = [];
  private heroes: TownHero[] = [];
  private readonly towns = new Map<string, Project>();
  private readonly foreignLooks = new Map<string, TownTheme>(); // Ledger themes live only in records.
  private records: TownRecord[] = [];
  private list: "sleeping" | "archived" | TownTheme | undefined;
  private listContent = "";
  private walkers: Walker[] = [];
  private readonly art = new Sheets();
  private readonly ctx: CanvasRenderingContext2D;
  private place: Place = "world";
  private project: string | undefined;
  private focused: string | undefined;
  private ambient: Ambient | undefined;
  private gateMenu = false;
  private sleepingPlate = { x: 0, y: 0, w: 0, h: 0 };
  private archivedPlate = { x: 0, y: 0, w: 0, h: 0 };
  private pointer: [number, number] = [-1, -1];
  private last = 0;
  private flashAt = -Infinity;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly layer: HTMLElement) {
    this.ctx = canvas.getContext("2d")!;
    canvas.addEventListener("mousemove", (event) => {
      this.pointer = this.point(event);
      canvas.style.cursor = this.hit(...this.pointer) ? "pointer" : "default";
    });
    canvas.addEventListener("click", (event) => {
      const hot = this.hit(...this.point(event));
      if (hot) hot.act(); else this.gateMenu = false;
    });
    layer.addEventListener("click", (event) => { if (event.target === layer) layer.hidden = true; });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") layer.hidden = true; });
    document.querySelector("#world-back")!.addEventListener("click", () => this.go("world"));
    document.querySelector("#settings")!.addEventListener("click", () => { this.list = undefined; showSettings(layer); });
    const pin = document.querySelector<HTMLButtonElement>("#town-pin")!;
    pin.addEventListener("click", () => {
      const town = this.records.find((record) => record.name === this.project);
      if (!town) return;
      pin.disabled = true;
      void this.changeTown(town.name, { pinned: !town.pinned }).finally(() => { pin.disabled = false; });
    });
    document.querySelector("#town-look")!.addEventListener("click", () => {
      const town = this.project === undefined ? undefined : this.towns.get(this.project);
      if (town) this.chooseLook(town); else this.go("world");
    });
  }

  async load(): Promise<void> {
    await this.art.load();
    await document.fonts.load('10px "DotGothic16"');
  }

  sync(room: Room, now: number, replaying = false): void {
    const view = townView(room, now, this.history);
    this.history = view.names;
    for (const entry of view.names) this.names.set(entry.id, entry.name);
    this.heroes = view.projects.flatMap((town) => town.heroes);
    this.rebuildTowns();
    if (!replaying && this.list && !this.layer.hidden) this.openList(this.list);
    // Replay first rebuilds naming/town history; validate navigation only against the final Room.
    if (replaying) return;
    if (this.place !== "world" && (this.project === undefined || !this.towns.has(this.project))) {
      this.project = undefined;
      this.go("world");
    }
    const strolling = this.heroes.filter((hero) => hero.place === "town");
    this.walkers = this.walkers.filter((walker) => strolling.some((hero) => hero.id === walker.id));
    for (const hero of strolling) {
      let walker = this.walkers.find((w) => w.id === hero.id);
      if (!walker) { walker = makeWalker(hero.id, hero.name, heroVariant(hero.id), this.walkers.length); this.walkers.push(walker); }
      walker.name = hero.name;
      walker.party = hero.party.map((job) => `party-${job}`);
    }
    if (this.selected && !room.agents.has(this.selected)) this.selected = undefined;
    if (!this.selected) this.selected = this.localHeroes()[0]?.id;
    if (this.focused) {
      const hero = this.heroes.find((h) => h.id === this.focused);
      if (!hero?.monster || hero.place !== this.place) this.go(hero?.place ?? this.place);
    }
  }

  setTowns(towns: TownRecord[]): void {
    this.records = towns;
    for (const town of towns) this.foreignLooks.delete(town.name);
    this.rebuildTowns();
    if (this.list && !this.layer.hidden) this.openList(this.list);
  }

  private look(name: string): TownTheme | undefined {
    const record = this.records.find((town) => town.name === name);
    return record ? record.theme : this.foreignLooks.get(name);
  }
  private rebuildTowns(): void {
    this.towns.clear();
    for (const town of this.records.filter((record) => record.archivedAt === undefined)) {
      this.towns.set(town.name, { repo: town.name, theme: town.theme ?? "village", heroes: 0, fighting: 0, unread: 0, calling: false, pinned: town.pinned });
    }
    for (const hero of this.heroes) {
      if (!this.towns.has(hero.project) && !hero.agent.terminal) {
        this.towns.set(hero.project, { repo: hero.project, theme: this.look(hero.project) ?? "village", heroes: 0, fighting: 0, unread: 0, calling: false });
      }
    }
    for (const hero of this.heroes) {
      const town = this.towns.get(hero.project);
      if (town) { town.heroes++; if (hero.monster) town.fighting++; }
    }
  }

  private async changeTown(name: string, change: TownChange): Promise<boolean> {
    const feedback = document.querySelector<HTMLElement>("#town-feedback")!;
    try {
      const town = await patchTown(name, change);
      this.setTowns(this.records.map((record) => record.name === town.name ? town : record));
      feedback.hidden = true;
      return true;
    } catch {
      feedback.textContent = "町の台帳に ほぞんできませんでした。もういちど おためしください。";
      feedback.hidden = false;
      return false;
    }
  }

  private openList(kind: "sleeping" | "archived" | TownTheme): void {
    const towns = [...this.towns.values()];
    const projects = kind === "archived" ? this.records.filter((record) => record.archivedAt !== undefined).map((record) => ({
      repo: record.name, theme: record.theme, heroes: 0, fighting: 0, unread: 0, calling: false,
    })) : kind === "sleeping" ? sleeping(towns) : towns.filter((town) => town.heroes > 0 && town.theme === kind);
    const content = JSON.stringify(projects);
    if (this.list === kind && !this.layer.hidden && this.listContent === content) return;
    this.list = kind; this.listContent = content;
    const close = () => { this.list = undefined; };
    if (kind === "archived") showArchivedTowns(this.layer, projects, async (town) => { await this.changeTown(town.repo, { archived: false }); }, close);
    else showTownList(this.layer, kind === "sleeping" ? "ねむっている町" : `${regionName(kind)}の 町（${projects.length}）`, projects,
      (town) => this.enter(town), close, kind === "sleeping" ? async (town) => { await this.changeTown(town.repo, { pinned: !town.pinned }); } : undefined);
  }

  select(id: string | undefined): void {
    this.selected = id;
    const hero = this.heroes.find((h) => h.id === id);
    const town = hero && this.towns.get(hero.project);
    if (hero && town) this.enter(town, hero.place);
  }

  private localHeroes(): TownHero[] { return this.heroes.filter((hero) => hero.project === this.project); }
  private go(place: Place): void {
    this.place = place; this.focused = undefined; this.ambient = undefined; this.gateMenu = false;
    this.layer.hidden = true; this.list = undefined;
  }
  private enter(project: Project, place: HeroPlace = "town"): void {
    if (!this.look(project.repo)) { this.go("world"); this.chooseLook(project, place); return; }
    this.project = project.repo;
    this.selected = this.heroes.find((hero) => hero.project === project.repo && hero.id === this.selected)?.id
      ?? this.heroes.find((hero) => hero.project === project.repo)?.id;
    this.go(place);
  }
  private chooseLook(project: Project, place: HeroPlace = "town"): void {
    this.list = undefined;
    showThemeChooser(this.layer, project, this.art, (theme) => {
      void (async () => {
        if (this.records.some((record) => record.name === project.repo)) {
          if (!await this.changeTown(project.repo, { theme })) return;
        } else { this.foreignLooks.set(project.repo, theme); this.rebuildTowns(); }
        this.enter(this.towns.get(project.repo) ?? { ...project, theme }, place);
      })();
    }, () => undefined);
  }

  private fights(now: number): Fight[] {
    return this.localHeroes().filter((h) => h.place === this.place && h.monster).slice(0, SLOTS.length).map((hero, i) => ({
      id: hero.id, x: SLOTS[i][0], y: SLOTS[i][1], name: hero.name, variant: heroVariant(hero.id),
      monster: `monster-${hero.monster}`, target: hero.agent.target ?? MONSTER_NAMES[hero.monster!],
      party: hero.party.map((job) => `party-${job}`), fx: FX[hero.monster!], level: stats(hero.agent, now).level,
      counter: hero.agent.failures.some((at) => now >= at && now - at < 2000),
    }));
  }
  private focus(hero: TownHero, now: number): Focus {
    const values = stats(hero.agent, now);
    return { backdrop: `bg-battle-${hero.place}`, theme: hero.place as Theme, monster: `monster-${hero.monster}`,
      enemyFx: FX[hero.monster!], name: MONSTER_NAMES[hero.monster!], variant: heroVariant(hero.id),
      party: ["hero-back-battle", ...hero.party.slice(0, 4).map((job) => `party-${job}-back`)],
      status: [{ name: hero.name, ...values }, ...hero.party.slice(0, 4).map((job) => ({ name: JOB_NAMES[job] }))],
      message: `${hero.name}は ${MONSTER_NAMES[hero.monster!]}と たたかっている！\n${hero.agent.target ?? ""}`, counter: hero.agent.failures.some((at) => now >= at && now - at < 2000) };
  }

  private size(): [number, number] {
    if (this.focused) return this.art.size(`bg-battle-${this.place}`);
    return this.place === "world" ? this.art.size("world-map") : [TOWN_W, TOWN_H];
  }
  private hotspots(): Hot[] {
    if (!this.layer.hidden) return [];
    const [w, h] = this.size();
    if (this.focused) return [{ x: 0, y: 0, w, h, act: () => this.go(this.place) }];
    if (this.place === "world") {
      const towns = [...this.towns.values()];
      return [...markers(w, h, towns).map((marker) => ({ x: marker.x - 34, y: marker.y - 22, w: 68, h: 60, act: () => {
        if (marker.projects.length > 1) this.openList(marker.theme);
        else this.enter(marker.projects[0]);
      } })), { ...this.sleepingPlate, act: () => this.openList("sleeping") },
        { ...this.archivedPlate, act: () => this.openList("archived") }];
    }
    if (this.place === "inn") return [{ x: 0, y: 0, w, h, act: () => this.go("town") }];
    if (this.place === "town") {
      const spots: Hot[] = [{ ...TOWN_SPOTS.inn, act: () => this.go("inn") }];
      for (const walker of this.walkers.filter((w) => this.localHeroes().some((h) => h.id === w.id))) {
        spots.push({ x: walker.x - 16, y: walker.y - 76, w: 32, h: 80, act: () => { this.selected = walker.id; } });
      }
      if (this.gateMenu) for (const [i, theme] of (["meadow", "cave", "forest"] as const).entries()) spots.push({
        x: 410, y: 404 + i * 20, w: 140, h: 18, text: `▶ ${FIELD_NAMES[theme]}`, act: () => this.go(theme),
      });
      else spots.push({ x: 430, y: 488, w: 100, h: 52, text: "▼ フィールドへ", act: () => { this.gateMenu = true; } });
      return spots;
    }
    const spots: Hot[] = FIELD_EXITS[this.place].map((exit) => ({ x: exit.x - 44, y: exit.y - 14, w: 88, h: 22, text: exit.text, act: () => this.go(exit.to) }));
    for (const fight of this.fights(Date.now())) spots.push({ x: fight.x - 22, y: fight.y - 60, w: 44, h: 66, act: () => {
      this.selected = fight.id; this.focused = fight.id;
      this.ambient = new Ambient(this.art, this.place as Theme, `bg-battle-${this.place}`);
      this.flashAt = performance.now();
    } });
    return spots;
  }
  private point(event: MouseEvent): [number, number] {
    const rect = this.canvas.getBoundingClientRect(), [w, h] = this.size();
    return [(event.clientX - rect.left) * w / rect.width, (event.clientY - rect.top) * h / rect.height];
  }
  private hit(x: number, y: number): Hot | undefined { return this.hotspots().find((s) => x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h); }

  frame(time: number, now: number): void {
    const theme = this.project === undefined ? undefined : this.look(this.project);
    if (this.place !== "world" && !theme) {
      const place = this.place, town = this.project && this.towns.get(this.project);
      this.go("world");
      if (town) this.chooseLook(town, place);
    }
    const dt = Math.min(100, time - this.last); this.last = time;
    stepWalkers(this.walkers, time, dt);
    const [w, h] = this.size(), ctx = this.ctx;
    if (this.canvas.width !== w * 2 || this.canvas.height !== h * 2) { this.canvas.width = w * 2; this.canvas.height = h * 2; }
    ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.imageSmoothingEnabled = false;
    const local = this.localHeroes(), hero = local.find((h) => h.id === this.focused);
    if (hero && this.ambient) {
      drawFocus(ctx, this.art, this.focus(hero, now), this.ambient, time, dt, w, h);
      label(ctx, "クリックで もどる", w - 64, 58, "#ffe066", 9);
    } else if (this.place === "world") {
      this.sleepingPlate = drawWorld(ctx, this.art, time, w, h, [...this.towns.values()]);
      this.archivedPlate = plate(ctx, [[`しまった町 ${this.records.filter((town) => town.archivedAt !== undefined).length}`, "#c9c3dc", 9]], 68, h - 24);
    }
    else if (this.place === "town") drawTown(ctx, this.art, time, {
      sleepers: local.filter((h) => h.place === "inn").length, theme: theme!, name: this.project!,
      walkers: this.walkers.filter((w) => local.some((h) => h.id === w.id)),
    });
    else if (this.place === "inn") drawInn(ctx, this.art, time, local.filter((h) => h.place === "inn").map((h) => h.name));
    else drawField(ctx, this.art, this.place, time, this.fights(now), undefined, Math.max(0, local.filter((h) => h.place === this.place).length - SLOTS.length));
    drawNavigation(ctx, this.hotspots(), this.pointer, this.gateMenu);
    if (time - this.flashAt < 300) { ctx.fillStyle = `rgba(255,255,255,${1 - (time - this.flashAt) / 300})`; ctx.fillRect(0, 0, w, h); }
    const title = this.place === "world" ? "ワールドマップ" : `${this.project} / ${this.place === "town" ? "まち" : this.place === "inn" ? "やどや" : FIELD_NAMES[this.place]}`;
    document.querySelector("#place-name")!.textContent = title;
    (document.querySelector("#town-look") as HTMLButtonElement).hidden = this.place === "world";
    const pin = document.querySelector<HTMLButtonElement>("#town-pin")!;
    const record = this.records.find((town) => town.name === this.project);
    pin.hidden = this.place === "world" || !record;
    pin.textContent = record?.pinned ? "◆ ピンどめ中" : "◇ ピンどめ";
    pin.setAttribute("aria-pressed", String(record?.pinned ?? false));
    this.canvas.setAttribute("aria-label", `${title}。${local.map((h) => `${h.name}: ${h.place}`).join("、")}`);
  }
}
