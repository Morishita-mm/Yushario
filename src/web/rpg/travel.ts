import type { Sheets } from "../town/sheets";
import type { TownHero } from "../../core/town";
import type { EquipmentTiers } from "../../core/battle-presentation";
import { heroVariant } from "../town/appearance";
import { leave, makeWalker, returnWalker, stepWalkers, type Walker } from "../town/walkers";

// Only drawing state survives SessionEnd, until the shared gate/wave animation ends.
export class HeroTravel {
  walkers: Walker[] = [];
  private departing: { project: string; terminal?: string; walker: Walker }[] = [];
  private arriving = new Set<string>();

  constructor(private readonly art: Sheets) {}

  expect(terminal: string, heroes: TownHero[]): void {
    this.arriving.add(terminal);
    this.sync(heroes);
  }

  sync(heroes: TownHero[], gear?: (terminal?: string) => EquipmentTiers): void {
    // A recalled terminal is a new journey, not the old hero finishing its farewell.
    this.departing = this.departing.filter((item) => !heroes.some((hero) => hero.id === item.walker.id
      && hero.agent.terminal !== item.terminal && hero.agent.terminal && this.arriving.has(hero.agent.terminal)));
    const strolling = heroes.filter((hero) => hero.place === "town" && !this.departing.some((item) => item.walker.id === hero.id));
    this.walkers = this.walkers.filter((walker) => strolling.some((hero) => hero.id === walker.id));
    for (const hero of strolling) {
      let walker = this.walkers.find((item) => item.id === hero.id);
      if (!walker) {
        walker = makeWalker(this.art, hero.id, hero.name, heroVariant(hero.id), this.walkers.length);
        this.walkers.push(walker);
      }
      if (hero.agent.terminal && this.arriving.delete(hero.agent.terminal)) returnWalker(this.art, walker);
      walker.name = hero.name;
      walker.party = hero.party.map((job) => `party-${job}`);
      if (gear) walker.weaponTier = gear(hero.agent.terminal).weaponTier;
    }
  }

  prepare(hero: TownHero): () => void {
    const terminal = hero.agent.terminal;
    const current = this.walkers.find((item) => item.id === hero.id);
    const walker = current ? { ...current, path: [...current.path], party: [...current.party] }
      : makeWalker(this.art, hero.id, hero.name, heroVariant(hero.id), 0);
    return () => {
      if (this.departing.some((item) => item.walker.id === hero.id)) return;
      walker.paused = false;
      leave(this.art, walker);
      this.walkers = this.walkers.filter((item) => item.id !== hero.id);
      this.departing.push({ project: hero.project, terminal, walker });
    };
  }

  local(project: string | undefined, heroes: TownHero[]): Walker[] {
    return [...this.walkers.filter((walker) => heroes.some((hero) => hero.id === walker.id)),
      ...this.departing.filter((item) => item.project === project).map((item) => item.walker)];
  }

  step(time: number, dt: number): void {
    stepWalkers(this.art, this.walkers, time, dt);
    const walkers = this.departing.map((item) => item.walker);
    const gone = stepWalkers(this.art, walkers, time, dt);
    this.departing = this.departing.filter((item) => !gone.includes(item.walker));
  }
}
