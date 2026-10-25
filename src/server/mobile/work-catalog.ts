import { randomUUID } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import type { MobileHero } from "../../core/mobile-display";
import { heroVariant } from "../../core/mobile-hero";
import { mobileModel, mobileEffort, type MobileChoice, type MobileWorkBase, type MobileLaunch, type MobileWorkHero, type MobileWorkPreset } from "../../core/mobile-work";
import { townKey, type TownRecord } from "../../core/town-ledger";
import type { Equipment } from "../../core/equipment";
import { AGENTS, agentExecutables, type Preset } from "../agents";
import type { PtyManager } from "../pty";
import type { QuestLedger } from "../quest-ledger";
import { existingWorktrees } from "../worktrees";
import { mobileShort } from "./operations";
import type { MobileQuests } from "./quests";

// Only these may be started from a phone; Pi and shell never are.
const MOBILE_PRESETS = ["claude", "codex"] as const satisfies readonly Preset[];
type MobilePreset = typeof MOBILE_PRESETS[number];
export type MobileLaunchOptions = { preset: MobilePreset; cwd: string } & Equipment;
export type MobileCatalogHero = { session: string | null; agent?: string; active: boolean; canTalk: boolean; busy: boolean; preset: string };
type Base = { town: string; path: string };
type Gear = { preset: MobilePreset; kind: "weapon" | "accessory"; item: string };

// Every public ID here is random and process-private: never derived from a path, preset or item ID.
// Restart invalidates them; nothing the phone sends is used as a path, argument or raw preset.
export class MobileWorkCatalog {
  private readonly heroIds = new Map<string, string>(); // "s:<session>" | "a:<agent>" -> public ID
  private readonly bases = new Map<string, Base>();
  private readonly presets = new Map<string, MobilePreset>();
  private readonly gear = new Map<string, Gear>();
  constructor(private readonly quests: MobileQuests, private readonly pty: PtyManager, private readonly ledger: QuestLedger,
    private readonly getTowns: () => readonly TownRecord[], private readonly getHeroes: () => readonly MobileHero[]) {}

  town(townId: string): string { return this.quests.townKey(townId); }
  townId(key: string): string | null { return this.quests.townId(key); }

  private identity(sessionOrAgent: string): string {
    if (this.pty.getSession(sessionOrAgent)) return `s:${sessionOrAgent}`;
    const session = this.pty.sessionForAgent(sessionOrAgent);
    return session ? `s:${session.id}` : `a:${sessionOrAgent}`;
  }
  // A PTY hero keeps one ID whether it is named by its terminal or by its conversation (agent) ID.
  heroId(sessionOrAgent: string): string {
    const key = this.identity(sessionOrAgent);
    let id = this.heroIds.get(key);
    if (!id && key.startsWith("s:")) {
      // The pre-spawn audit may have reserved the terminal ID before it exists.
      id = this.heroIds.get(`a:${sessionOrAgent}`);
      if (id) this.heroIds.delete(`a:${sessionOrAgent}`);
    }
    if (!id) id = randomUUID();
    this.heroIds.set(key, id); return id;
  }
  hero(heroId: string, town: string): MobileCatalogHero {
    const key = [...this.heroIds].find(([, id]) => id === heroId)?.[0];
    if (!key) throw Error("Unknown hero");
    if (key.startsWith("a:")) {
      const agent = key.slice(2);
      if (this.quests.agentTown(agent) !== town || this.pty.sessionForAgent(agent)) throw Error("Unknown hero");
      return { session: null, agent, active: false, canTalk: false, busy: false, preset: "" };
    }
    const info = this.pty.getSession(key.slice(2)), state = info && this.pty.agentSession(info.id);
    if (!info || !state || !AGENTS[info.preset].hero || info.project !== town) throw Error("Unknown hero");
    return { session: info.id, ...(info.hero ? { agent: info.hero } : {}), active: state.active,
      canTalk: state.active && state.canSay, busy: state.active && !state.waiting, preset: info.preset };
  }

  private async baseChoices(town: string): Promise<{ id: string; name: string; path: string }[]> {
    const record = this.getTowns().find(item => townKey(item) === town);
    if (!record) throw Error("Unknown town");
    let paths: string[];
    try { paths = await existingWorktrees(record.path); }
    catch {
      // A non-Git town has exactly one base: its own registered folder.
      try { paths = statSync(record.path).isDirectory() ? [realpathSync(record.path)] : []; } catch { paths = []; }
    }
    return paths.slice(0, 100).map((path, index) => {
      let id = [...this.bases].find(([, base]) => base.town === town && base.path === path)?.[0];
      if (!id) { id = randomUUID(); this.bases.set(id, { town, path }); }
      return { id, path, name: index === 0 ? "本拠地" : `拠点 ${index + 1}` };
    });
  }
  private available(): MobilePreset[] {
    return MOBILE_PRESETS.filter(preset => AGENTS[preset].hero && agentExecutables[preset]);
  }
  private issue<T>(map: Map<string, T>, value: T, same: (a: T) => boolean): string {
    const found = [...map].find(([, item]) => same(item))?.[0];
    if (found) return found;
    const id = randomUUID(); map.set(id, value); return id;
  }
  private presetChoices(): MobileWorkPreset[] {
    return this.available().map(preset => {
      const master = this.pty.gear(preset);
      const choice = (kind: Gear["kind"]) => (item: { id: string; name: string }): MobileChoice => ({
        id: this.issue(this.gear, { preset, kind, item: item.id }, gear => gear.preset === preset && gear.kind === kind && gear.item === item.id),
        name: mobileShort(item.name, 200, "そうび") });
      return { id: this.issue(this.presets, preset, item => item === preset), name: AGENTS[preset].label,
        weapons: AGENTS[preset].modelArg ? master.weapons.slice(0, 100).map(item => ({ ...choice("weapon")(item),
          model: mobileModel(item.model) ? item.model : null })) : [],
        accessories: AGENTS[preset].thinkingArg ? master.accessories.slice(0, 100).map(item => ({ ...choice("accessory")(item),
          effort: mobileEffort(item.value) ? item.value : null })) : [] };
    });
  }
  private heroViews(town: string): MobileWorkHero[] {
    const room = new Map(this.getHeroes().map(hero => [hero.id, hero]));
    const sessions = this.pty.listSessions().filter(info => AGENTS[info.preset].hero && info.project === town);
    const counts = new Map<string, number>();
    const views: MobileWorkHero[] = sessions.map(info => {
      const hero = this.hero(this.heroId(info.id), town), master = this.pty.gear(info.preset);
      const agent = info.hero ?? info.recalledHero;
      const roomHero = agent ? room.get(agent) : undefined;
      let name = roomHero?.name;
      if (!name) {
        const label = mobileShort(this.pty.sessionLabel(info.id) ?? AGENTS[info.preset].label, 190, "勇者"), count = (counts.get(label) ?? 0) + 1;
        counts.set(label, count); name = count > 1 ? `${label} #${count}` : label;
      }
      const weapon = master.weapons.find(item => item.id === info.weapon), accessory = master.accessories.find(item => item.id === info.accessory);
      const model = weapon?.model, effort = accessory?.value;
      const label = (item: { name: string } | undefined) => item ? mobileShort(item.name, 200, "そうび") : null;
      return { id: this.heroId(info.id), name, variant: roomHero?.variant ?? heroVariant(agent ?? info.id), townId: hero.active ? this.townId(town) : null, preset: AGENTS[info.preset].label, weapon: label(weapon),
        accessory: label(accessory), model: mobileModel(model) ? model : null, effort: mobileEffort(effort) ? effort : null,
        busy: hero.busy, canTalk: hero.canTalk, active: hero.active,
        questId: this.ledger.current(info.id)?.id ?? null, permissionGate: info.preset !== "pi" };
    });
    // Heroes seen in the room without a PTY on this Mac are shown but cannot be talked to.
    for (const hero of room.values()) {
      if (this.pty.sessionForAgent(hero.id) || this.quests.agentTown(hero.id) !== town) continue;
      views.push({ id: this.heroId(hero.id), name: hero.name, variant: hero.variant, townId: null, preset: "外部の勇者", weapon: null, accessory: null, model: null, effort: null, busy: false,
        canTalk: false, active: false, questId: null, permissionGate: false });
    }
    return views.slice(0, 16);
  }

  async options(townId: string, allowWork: boolean): Promise<{ allowWork: boolean; heroes: MobileWorkHero[]; bases: MobileWorkBase[]; presets: MobileWorkPreset[] }> {
    const town = this.town(townId);
    const bases = (await this.baseChoices(town)).map(({ id, name }) => ({ id, name, townId: this.townId(town) }));
    return { allowWork, heroes: this.heroViews(town), bases, presets: this.presetChoices() };
  }

  // Resolves only IDs this catalog issued, and only while the base, preset and gear are still current.
  async launchOptions(town: string, launch: MobileLaunch): Promise<MobileLaunchOptions> {
    const base = this.bases.get(launch.baseId), preset = this.presets.get(launch.presetId);
    if (!base || base.town !== town || !preset || !this.available().includes(preset)) throw Error("Invalid launch");
    if (!(await this.baseChoices(town)).some(choice => choice.id === launch.baseId && choice.path === base.path)) throw Error("Stale base");
    const master = this.pty.gear(preset), result: MobileLaunchOptions = { preset, cwd: base.path };
    for (const [kind, id] of [["weapon", launch.weaponId], ["accessory", launch.accessoryId]] as const) {
      if (id === null) continue;
      const gear = this.gear.get(id), items = kind === "weapon" ? master.weapons : master.accessories;
      const allowed = kind === "weapon" ? AGENTS[preset].modelArg : AGENTS[preset].thinkingArg;
      if (!gear || gear.preset !== preset || gear.kind !== kind || !allowed || !items.some(item => item.id === gear.item)) throw Error("Invalid gear");
      result[kind] = gear.item;
    }
    return result;
  }
}
