import type { Focus } from "../town/battle";
import type { Theme } from "../town/ambient";

const NAMES: Record<string, string> = {
  "hero-back-battle": "t12-vitals", "party-warrior-back": "せんし", "party-mage-back": "まほうつかい",
  "party-thief-back": "とうぞく", "party-priest-back": "そうりょ",
};
export function focusData(backdrop: string, theme: Theme, monster: string, enemyFx: number, name: string, party: string[]): Focus {
  return { backdrop, theme, monster, enemyFx, name, party, demo: true, message: "", damage: { hero: 23, party: 18, enemy: 15 },
    status: party.map((id, i) => ({ name: NAMES[id] ?? id, hp: 0.77, mp: i === 0 ? 0.34 : 0.2 })) };
}

export function battleBeat(focus: Focus, t: number): Focus {
  const c = t % 9000, counter = c > 4200 && c < 6200;
  const message = c < 1700 ? `t12-vitalsの こうげき！\n${focus.name}に 23の ダメージ！`
    : c < 3600 ? "なかまの こうげき！\nかいしんの いちげき！ 18の ダメージ！"
      : c < 4200 ? `${focus.name}の ようすが おかしい…`
        : c < 6200 ? `テストが しっぱいした！ ${focus.name}の はんげき！\nt12-vitalsは 15の ダメージを うけた！`
          : `${focus.name}を やっつけた！\nクエスト「テストを書く」を たっせいした！`;
  return { ...focus, message, status: focus.status.map((status, i) => ({ ...status, hp: i === 0 && counter && c > 4850 ? 0.62 : 0.77 })) };
}
