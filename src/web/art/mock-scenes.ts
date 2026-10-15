import { tr } from "../language";
import type { HeroPlace } from "../../core/town";
import type { Focus } from "../town/battle";
import { focusData as FOCUS } from "./mock-battle-data";
import type { Sheets } from "../town/sheets";
import { PROJECTS, SLEEPERS, PRAYERS, FIGHTS, TOWN_REPORTS } from "./mock-data";

export type Place = "world" | HeroPlace;
export type Scene = { id: string; label: string; caption: string; place?: Place; focus?: Focus };
const equipmentBattle = FOCUS("bg-battle-meadow", "meadow", "monster-dragon", "fire", tr("ドラゴン", "Dragon"), ["hero-back-battle", "party-warrior-back", "party-mage-back"]);
equipmentBattle.status[0].name = tr("とてもながいなまえのゆうしゃとなかまたち", "LongHeroName123456789012");
export const SCENES: Scene[] = [
  { id: "equipment-town", label: tr("そうびの町", "Equipment town"), place: "town", caption: tr("そうびなし・鉄のたんけん・青い鋼・金のでんせつ。同じ服の勇者と名前札横の武器の印を見くらべる。", "No weapon, iron dagger, blue steel, legendary gold. Compare the heroes' weapons and the icons beside their names.") },
  { id: "equipment-battle", label: tr("そうびの戦闘", "Equipment battle"), focus: { ...equipmentBattle, weaponTier: 3, accessoryTier: 5 }, caption: tr("でんせつのつるぎ＋高いアクセサリ。長いため・大きいダメージ・ときどき会心。失敗の反撃は変わらない。", "Legendary Sword and a high-tier accessory: longer charge, bigger damage, occasional critical hits. Failures still trigger counterattacks.") },
  { id: "world", label: tr("ワールド", "World"), place: "world", caption: tr("ワールドマップ。プロジェクト（リポジトリ）ごとに町がある。町の種類は5つ（草原の村・海辺の港町・雪国・砂漠のオアシス・火山）。人数・戦闘中・未読の報告・呼び出しを町の上に表示。クリックで町へ。", "World map. Each project (repository) has a town: meadow village, port, snow, desert oasis or volcano. Town markers show heroes, battles, unread reports and calls. Click to enter.") },
  { id: "town", label: tr("まち", "Town"), place: "town", caption: tr("待機中のエージェントが暮らす町。広場の噴水を中心に宿屋・店が向き合い、通りに沿って歩く。宿屋・きょうかいをクリックで中へ、南の門から各フィールドへ。", "Idle agents walk through town, past the fountain, inn and shops. Click the inn or church to enter; take the south gate to the fields.") },
  { id: "meadow", label: tr("そうげん", "Meadow"), place: "meadow", caption: tr("ファイル編集の戦場。勇者とモンスターが向き合って戦う。勇者をクリックでその戦闘にフォーカス。端の立て札で他のマップへ。", "The battlefield for file edits. Heroes face monsters; click a hero to watch their battle. Follow the signs to other maps.") },
  { id: "cave", label: tr("どうくつ", "Cave"), place: "cave", caption: tr("テスト・型検査の戦場（しれんのゴーレム）。", "The battlefield for tests and typechecks: the trial Golem.") },
  { id: "forest", label: tr("よるのもり", "Night Forest"), place: "forest", caption: tr("コマンド実行の戦場（おばけ）。", "The battlefield for shell commands: the Ghost.") },
  { id: "inn", label: tr("やどや", "Inn"), place: "inn", caption: tr("宿屋の中。居眠り中（10分以上動きなし）のエージェントが奥のベッドで眠る。勇者でコマンド窓、▼ そとへ で町へ。", "Inside the inn. Agents idle for over ten minutes sleep in the beds. Click a hero for commands, or ▼ Exit to return to town.") },
  { id: "church", label: tr("きょうかい", "Church"), place: "church", caption: tr("きょうかいの中。入口から祭壇まで1本のじゅうたん。やすむ（会話の整理）の勇者は奥を向いて祈る。神父さまをクリックで一言、勇者でコマンド窓、▼ そとへ で町へ。", "Inside the church. Resting heroes pray at the altar while compacting their context. Click the priest to hear a word, a hero for commands, or ▼ Exit to return to town.") },
  { id: "b-meadow", label: tr("戦闘：草原", "Battle: Meadow"), focus: FOCUS("bg-battle-meadow", "meadow", "monster-slime", "claw", tr("スライム", "Slime"), ["hero-back-battle", "party-thief-back"]), caption: tr("戦闘フォーカス（草原）。右下に コマンド（たたかう・さくせん・めいれい・にげる・もどる）。勇者を クリックで ひらき直す、ほかは もどる。", "Meadow battle. Commands: Fight, Tactics, Order, Flee and Back. Click the hero to reopen commands; click elsewhere to return.") },
  { id: "b-cave", label: tr("戦闘：洞窟", "Battle: Cave"), focus: FOCUS("bg-battle-cave", "cave", "monster-golem", "rocks", tr("ゴーレム", "Golem"), ["hero-back-battle", "party-warrior-back", "party-mage-back"]), caption: tr("戦闘フォーカス（洞窟）。", "Cave battle.") },
  { id: "b-forest", label: tr("戦闘：夜の森", "Battle: Night Forest"), focus: FOCUS("bg-battle-forest", "forest", "monster-ghost", "curse", tr("おばけ", "Ghost"), ["hero-back-battle", "party-priest-back"]), caption: tr("戦闘フォーカス（夜の森）。", "Night forest battle.") },
  { id: "b-boss", label: tr("戦闘：ボス", "Battle: Boss"), focus: FOCUS("bg-battle-meadow", "meadow", "monster-dragon", "fire", tr("ドラゴン", "Dragon"), ["hero-back-battle", "party-warrior-back", "party-mage-back", "party-thief-back", "party-priest-back"]), caption: tr("任せた仕事（ドラゴン）にパーティー全員で挑む。", "The whole party faces the Dragon: a delegated task.") },
];

export function sceneSize(art: Sheets, scene: Scene): [number, number] {
  if (scene.focus) return art.size(scene.focus.backdrop);
  return scene.place === "world" ? art.size("world-map") : [960, 540];
}

export function updateSceneTabs(tabs: HTMLElement, current: Scene, townName: string, read: ReadonlySet<string>, now: number): void {
  for (const button of tabs.querySelectorAll<HTMLButtonElement>("button")) {
    const scene = SCENES.find((scene) => scene.id === button.dataset.id)!;
    const theme = scene.place && scene.place !== "town" && scene.place !== "inn" && scene.place !== "church" && scene.place !== "world" ? scene.place : undefined;
    const count = button.querySelector<HTMLElement>(".count");
    const alert = button.querySelector<HTMLElement>(".alert");
    if (!count || !alert) continue;
    if (scene.place === "world") count.textContent = `🏰 ${PROJECTS.length}`;
    else if (scene.place === "town") count.textContent = `👤 ${7 + 3}`;
    else if (scene.place === "inn") count.textContent = `💤 ${SLEEPERS.length}`;
    else if (scene.place === "church") count.textContent = tr(`祈り ${PRAYERS.length}`, `Praying ${PRAYERS.length}`);
    else if (theme) count.textContent = `⚔️ ${FIGHTS[theme].filter((f) => !f.done).length}`;
    if (scene.place === "town") button.querySelector(".name")!.textContent = townName;
    const unread = theme !== undefined && FIGHTS[theme].some((f) => f.done && !read.has(f.name))
      || scene.place === "town" && TOWN_REPORTS.some((r) => !read.has(r.name));
    const trouble = unread || theme !== undefined && current.place !== theme
      && FIGHTS[theme].some((fight) => { const c = (now + fight.x * 7) % 4200; return !fight.done && c > 2600 && c < 3600; });
    alert.style.visibility = trouble || (scene.place === "town" && current.place !== "town") ? "visible" : "hidden";
  }
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
