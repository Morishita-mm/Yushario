import { tr } from "../language";
import type { Focus } from "../town/battle";
import { battlePresentation } from "../../core/battle-presentation";
import type { Theme } from "../town/ambient";

const NAMES: Record<string, string> = {
  "hero-back-battle": "t12-vitals", "party-warrior-back": tr("せんし", "Warrior"), "party-mage-back": tr("まほうつかい", "Mage"),
  "party-thief-back": tr("とうぞく", "Thief"), "party-priest-back": tr("そうりょ", "Priest"),
};
export function focusData(backdrop: string, theme: Theme, monster: string, enemyFx: string, name: string, party: string[]): Focus {
  return { backdrop, theme, monster, enemyFx, name, party, demo: true, message: "", damage: { hero: 23, party: 18, enemy: 15 },
    status: party.map((id, i) => ({ name: NAMES[id] ?? id, hp: 0.77, mp: i === 0 ? 0.34 : 0.2 })) };
}

export function battleBeat(focus: Focus, t: number): Focus {
  const c = t % 9000, counter = c > 4200 && c < 6200;
  const effects = battlePresentation(focus, true, Math.floor(t / 9000), focus.damage?.hero ?? 23);
  const message = c < 1100 + effects.windup ? tr(`t12-vitalsの こうげき！\n${focus.name}に ${effects.damage}の ダメージ！`, `t12-vitals attacks!\n${effects.damage} damage to ${focus.name}!`)
    : c < 3600 ? tr("なかまの こうげき！\nかいしんの いちげき！ 18の ダメージ！", "Party attack!\nCritical hit! 18 damage!")
      : c < 4200 ? tr(`${focus.name}の ようすが おかしい…`, `${focus.name} looks uneasy…`)
        : c < 6200 ? tr(`テストが しっぱいした！ ${focus.name}の はんげき！\nt12-vitalsは 15の ダメージを うけた！`, `Test failed! ${focus.name} strikes back!\nt12-vitals takes 15 damage!`)
          : tr(`${focus.name}を やっつけた！\nクエスト「テストを書く」を たっせいした！`, `${focus.name} defeated!\nQuest "Write tests" complete!`);
  return { ...focus, message, status: focus.status.map((status, i) => ({ ...status, hp: i === 0 && counter && c > 4850 ? 0.62 : 0.77 })) };
}
