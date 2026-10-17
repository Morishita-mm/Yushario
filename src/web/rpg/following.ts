import { tr } from "../language";
import type { HeroPlace, TownHero } from "../../core/town";

// The followed hero lives only in this page; Room still supplies its whereabouts.
export class Following {
  private id: string | undefined;
  get heroId(): string | undefined { return this.id; }
  private name = "";
  private readonly banner = document.querySelector<HTMLElement>("#following")!;
  private readonly label = document.querySelector<HTMLElement>("#following-name")!;

  constructor(private readonly say: (text: string, at: number) => void) {
    document.querySelector("#following-stop")!.addEventListener("click", () => this.stop());
  }

  start(hero: TownHero): void {
    this.id = hero.id;
    this.name = hero.name;
    this.label.textContent = tr(`▶ ${hero.name}に ついていく`, `▶ Following ${hero.name}`);
    this.banner.hidden = false;
  }

  stop(): void {
    this.id = undefined;
    this.banner.hidden = true;
  }

  target(heroes: TownHero[], project: string | undefined, place: "world" | HeroPlace,
    focused: string | undefined, now: number): TownHero | undefined {
    if (!this.id) return;
    const hero = heroes.find((item) => item.id === this.id);
    if (!hero) {
      this.say(tr(`${this.name}は 旅立った。ついていくのをやめた。`, `${this.name} set off. Following ended.`), now);
      this.stop();
      return;
    }
    if (this.name !== hero.name) this.start(hero);
    return hero.project !== project || hero.place !== place || focused !== (hero.monster ? hero.id : undefined)
      ? hero : undefined;
  }
}
