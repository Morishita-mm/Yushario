import type { HeroPlace } from "../../core/town";
import type { Focus } from "../town/battle";
import { focusData as FOCUS } from "./mock-battle-data";
import type { Sheets } from "../town/sheets";

export type Place = "world" | HeroPlace;
export type Scene = { id: string; label: string; caption: string; place?: Place; focus?: Focus };
export const SCENES: Scene[] = [
  { id: "equipment-town", label: "そうびの町", place: "town", caption: "そうびなし・鉄のたんけん・青い鋼・金のでんせつ。同じ服の勇者と名前札横の武器の印を見くらべる。" },
  { id: "equipment-battle", label: "そうびの戦闘", focus: { ...FOCUS("bg-battle-meadow", "meadow", "monster-dragon", "fire", "ドラゴン", ["hero-back-battle", "party-warrior-back", "party-mage-back"]), weaponTier: 3, accessoryTier: 5 }, caption: "でんせつのつるぎ＋高いアクセサリ。長いため・大きいダメージ・ときどき会心。失敗の反撃は変わらない。" },
  { id: "world", label: "ワールド", place: "world", caption: "ワールドマップ。プロジェクト（リポジトリ）ごとに町がある。町の種類は5つ（草原の村・海辺の港町・雪国・砂漠のオアシス・火山）。人数・戦闘中・未読の報告・呼び出しを町の上に表示。クリックで町へ。" },
  { id: "town", label: "まち", place: "town", caption: "待機中のエージェントが暮らす町。広場の噴水を中心に宿屋・店が向き合い、通りに沿って歩く。宿屋・きょうかいをクリックで中へ、南の門から各フィールドへ。" },
  { id: "meadow", label: "そうげん", place: "meadow", caption: "ファイル編集の戦場。勇者とモンスターが向き合って戦う。勇者をクリックでその戦闘にフォーカス。端の立て札で他のマップへ。" },
  { id: "cave", label: "どうくつ", place: "cave", caption: "テスト・型検査の戦場（しれんのゴーレム）。" },
  { id: "forest", label: "よるのもり", place: "forest", caption: "コマンド実行の戦場（おばけ）。" },
  { id: "inn", label: "やどや", place: "inn", caption: "宿屋の中。居眠り中（10分以上動きなし）のエージェントが奥のベッドで眠る。勇者でコマンド窓、▼ そとへ で町へ。" },
  { id: "church", label: "きょうかい", place: "church", caption: "きょうかいの中。入口から祭壇まで1本のじゅうたん。やすむ（会話の整理）の勇者は奥を向いて祈る。神父さまをクリックで一言、勇者でコマンド窓、▼ そとへ で町へ。" },
  { id: "b-meadow", label: "戦闘：草原", focus: FOCUS("bg-battle-meadow", "meadow", "monster-slime", "claw", "スライム", ["hero-back-battle", "party-thief-back"]), caption: "戦闘フォーカス（草原）。右下に コマンド（たたかう・さくせん・めいれい・にげる・もどる）。勇者を クリックで ひらき直す、ほかは もどる。" },
  { id: "b-cave", label: "戦闘：洞窟", focus: FOCUS("bg-battle-cave", "cave", "monster-golem", "rocks", "ゴーレム", ["hero-back-battle", "party-warrior-back", "party-mage-back"]), caption: "戦闘フォーカス（洞窟）。" },
  { id: "b-forest", label: "戦闘：夜の森", focus: FOCUS("bg-battle-forest", "forest", "monster-ghost", "curse", "おばけ", ["hero-back-battle", "party-priest-back"]), caption: "戦闘フォーカス（夜の森）。" },
  { id: "b-boss", label: "戦闘：ボス", focus: FOCUS("bg-battle-meadow", "meadow", "monster-dragon", "fire", "ドラゴン", ["hero-back-battle", "party-warrior-back", "party-mage-back", "party-thief-back", "party-priest-back"]), caption: "任せた仕事（ドラゴン）にパーティー全員で挑む。" },
];

export function sceneSize(art: Sheets, scene: Scene): [number, number] {
  if (scene.focus) return art.size(scene.focus.backdrop);
  return scene.place === "world" ? art.size("world-map") : [960, 540];
}

// Equipment comparisons remain direct URLs, not extra review tabs.
export function initSceneTabs(tabs: HTMLElement, select: (scene: Scene) => void): void {
  for (const scene of SCENES.filter((scene) => !scene.id.startsWith("equipment-"))) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.id = scene.id;
    button.innerHTML = `<span class="name"></span><span class="count"></span><span class="alert">❗</span>`;
    button.querySelector(".name")!.textContent = scene.label;
    if (scene.focus) button.querySelector(".count")!.remove();
    button.addEventListener("click", () => select(scene));
    tabs.append(button);
  }
}
