import "@fontsource/dotgothic16/400.css";
import "./gallery.css";
import { Ambient, type Theme } from "../town/ambient";
import { drawFocus, type Focus } from "../town/battle";
import { drawField, FIELD_EXITS, FIELD_H, FIELD_W, label } from "../town/field";
import { REPORTS } from "./mock-report";
import { showReport } from "../town/report";
import type { TownTheme } from "../town/themes";
import { showCommands, showRoster } from "../town/command";
import { drawInn } from "../town/inn";
import { churchPriest, churchSlots, drawChurch, PRIEST_LINES } from "../town/church";
import { drawTown, TOWN_H, townSpots, TOWN_W } from "../town/town";
import { FIGHTS, PROJECTS, farewell, recall, ROSTER, SLEEPERS, PRAYERS, TOWN_REPORTS, townHeroes, walkers, equippedWalkers, townReports, CALLER, walkTown, initTown } from "./mock-data";
import { notices } from "./mock-notices";
import { renderHerald, showTownList, showThemeChooser, type Notice } from "../town/herald";
import { drawWorld, markers, plate, regionName, sleeping, type Project } from "../town/world";
import { Sheets } from "../town/sheets";
import { drawNavigation } from "../town/navigation";
import { focusData as FOCUS, battleBeat } from "./mock-battle-data";

type Place = "world" | "town" | "inn" | "church" | Theme;
type Scene = { id: string; label: string; caption: string; place?: Place; focus?: Focus };
const SCENES: Scene[] = [
  { id: "equipment-town", label: "そうびの町", place: "town", caption: "そうびなし・鉄のたんけん・青い鋼・金のでんせつ。同じ服の勇者と名前札横の武器の印を見くらべる。" },
  { id: "equipment-battle", label: "そうびの戦闘", focus: { ...FOCUS("bg-battle-meadow", "meadow", "monster-dragon", "fire", "ドラゴン", ["hero-back-battle", "party-warrior-back", "party-mage-back"]), weaponTier: 3, accessoryTier: 5 }, caption: "でんせつのつるぎ＋高いアクセサリ。長いため・大きいダメージ・ときどき会心。失敗の反撃は変わらない。" },
  { id: "world", label: "ワールド", place: "world", caption: "ワールドマップ。プロジェクト（リポジトリ）ごとに町がある。町の種類は5つ（草原の村・海辺の港町・雪国・砂漠のオアシス・火山）。人数・戦闘中・未読の報告・呼び出しを町の上に表示。クリックで町へ。" },
  { id: "town", label: "まち", place: "town", caption: "待機中のエージェントが暮らす町。広場の噴水を中心に宿屋・店が向き合い、通りに沿って歩く。宿屋・きょうかいをクリックで中へ、南の門から各フィールドへ。" },
  { id: "meadow", label: "そうげん", place: "meadow", caption: "ファイル編集の戦場。勇者とモンスターが向き合って戦う。勇者をクリックでその戦闘にフォーカス。端の立て札で他のマップへ。" },
  { id: "cave", label: "どうくつ", place: "cave", caption: "テスト・型検査の戦場（しれんのゴーレム）。" },
  { id: "forest", label: "よるのもり", place: "forest", caption: "コマンド実行の戦場（おばけ）。" },
  { id: "inn", label: "やどや", place: "inn", caption: "宿屋の中。居眠り中（10分以上動きなし）のエージェントがベッドで眠る。ベッドの大きさは空きと同じ。クリックで町へ。" },
  { id: "church", label: "きょうかい", place: "church", caption: "きょうかいの中。入口から祭壇まで1本のじゅうたん。やすむ（会話の整理）の勇者は奥を向いて祈る。神父さまをクリックで一言、勇者でコマンド窓、▼ そとへ で町へ。" },
  { id: "b-meadow", label: "戦闘：草原", focus: FOCUS("bg-battle-meadow", "meadow", "monster-slime", "claw", "スライム", ["hero-back-battle", "party-thief-back"]), caption: "戦闘フォーカス（草原）。クリックで戻る。" },
  { id: "b-cave", label: "戦闘：洞窟", focus: FOCUS("bg-battle-cave", "cave", "monster-golem", "rocks", "ゴーレム", ["hero-back-battle", "party-warrior-back", "party-mage-back"]), caption: "戦闘フォーカス（洞窟）。" },
  { id: "b-forest", label: "戦闘：夜の森", focus: FOCUS("bg-battle-forest", "forest", "monster-ghost", "curse", "おばけ", ["hero-back-battle", "party-priest-back"]), caption: "戦闘フォーカス（夜の森）。" },
  { id: "b-boss", label: "戦闘：ボス", focus: FOCUS("bg-battle-meadow", "meadow", "monster-dragon", "fire", "ドラゴン", ["hero-back-battle", "party-warrior-back", "party-mage-back", "party-thief-back", "party-priest-back"]), caption: "任せた仕事（ドラゴン）にパーティー全員で挑む。" },
];
const SCALE = 2;
const canvas = document.querySelector<HTMLCanvasElement>("#mock")!;
const ctx = canvas.getContext("2d")!;
const caption = document.querySelector<HTMLElement>("#caption")!;
const tabs = document.querySelector<HTMLElement>("#tabs")!;
const art = new Sheets();
let current = SCENES.find((s) => s.id === new URLSearchParams(location.search).get("scene")) ?? SCENES.find((scene) => scene.id === "world")!;
let ambient: Ambient | undefined;
let returnTo: Scene | undefined;
let gateMenu = false;
let priestLine = 0;
let fadeAt = -Infinity;
let pending: Scene | undefined;
let last = 0;
let pointer: [number, number] = [-1, -1];
const startTown = PROJECTS.find((p) => p.theme === new URLSearchParams(location.search).get("town")) ?? PROJECTS[0];
let town: { theme: TownTheme; repo: string } = { theme: startTown.theme!, repo: startTown.repo };
let sleepingPlate = { x: 0, y: 0, w: 0, h: 0 };
const herald = document.querySelector<HTMLElement>("#herald")!;

// Entering a town; a town whose kind is not chosen yet asks first.
function enter(project: Project): void {
  if (!project.theme) {
    showThemeChooser(reportRoot, project, art, (theme) => { project.theme = theme; refreshHerald(); enter(project); }, () => undefined);
    return;
  }
  town = { theme: project.theme, repo: project.repo };
  go(byId("town"));
}

function refreshHerald(): void {
  renderHerald(herald, notices(), (notice: Notice) => {
    const project = PROJECTS.find((p) => p.repo === notice.repo);
    if (project) enter(project);
  });
}
const read = new Set<string>();
let report: string | undefined; // name of the agent whose report is open
const reportRoot = document.querySelector<HTMLElement>("#report")!;

function openReport(name: string): void {
  if (!REPORTS[name]) return;
  report = name;
  showReport(reportRoot, name, REPORTS[name], () => { read.add(name); report = undefined; });
}
function closeLayer(): void {
  reportRoot.hidden = true;
  reportRoot.classList.remove("menu-layer");
  if (report) read.add(report);
  report = undefined;
}
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !reportRoot.hidden) closeLayer();
});
reportRoot.addEventListener("click", (event) => {
  if (event.target === reportRoot) closeLayer();
});

const byId = (id: string) => SCENES.find((s) => s.id === id)!;

function size(scene: Scene): [number, number] {
  if (scene.focus) return art.size(scene.focus.backdrop);
  if (scene.place === "world") return art.size("world-map");
  return scene.place === "town" || scene.place === "inn" || scene.place === "church" ? [TOWN_W, TOWN_H] : [FIELD_W, FIELD_H];
}

function show(scene: Scene): void {
  current = scene;
  gateMenu = false;
  ambient = scene.focus ? new Ambient(art, scene.focus.theme, scene.focus.backdrop) : undefined;
  const [w, h] = size(scene);
  canvas.width = w * SCALE;
  canvas.height = h * SCALE;
  caption.textContent = scene.caption;
  for (const button of tabs.querySelectorAll<HTMLButtonElement>("button")) button.classList.toggle("on", button.dataset.id === scene.id);
}

function go(scene: Scene, from?: Scene): void {
  returnTo = scene.focus ? from : undefined;
  if (scene.focus || current.focus) { fadeAt = performance.now(); show(scene); return; }
  pending = scene;
  fadeAt = performance.now();
}

let rosterPlate = { x: 0, y: 0, w: 0, h: 0 };
const toastBox = document.querySelector<HTMLElement>("#toast")!;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(text: string): void {
  toastBox.textContent = text;
  toastBox.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastBox.hidden = true; }, 3500);
}

// Open the command window next to a hero (map pixels → stage pixels).
function commands(name: string, x: number, y: number, fighting: boolean, watch?: () => void): void {
  const rect = canvas.getBoundingClientRect();
  const [w, h] = size(current);
  showCommands(reportRoot, { name, fighting, hasReport: Boolean(REPORTS[name]), at: [x * rect.width / w, (y - 30) * rect.height / h] }, {
    watch, toast,
    report: () => openReport(name),
    farewell: () => {
      if (current.place === "town") farewell(art, name);
      toast(`${name} は たびだった。ぼうけんしゃの めいぼに なまえが のこった`);
    },
  });
}

interface Hot { x: number; y: number; w: number; h: number; text?: string; act: () => void }
function hotspots(): Hot[] {
  const place = current.place;
  if (report) return [];
  if (place === "world") {
    const [w, h] = size(current);
    const spots: Hot[] = markers(art, w, h, PROJECTS).map((m) => ({
      x: m.x - 34, y: m.y - 22, w: 68, h: 60,
      act: () => m.projects.length > 1
        ? showTownList(reportRoot, `${regionName(m.theme)}の 町（${m.projects.length}）`, m.projects, enter, () => undefined)
        : enter(m.projects[0]),
    }));
    spots.push({ ...sleepingPlate, act: () => showTownList(reportRoot, `ねむっている町（${sleeping(PROJECTS).length}）`, sleeping(PROJECTS), enter, () => undefined) });
    return spots;
  }
  if (current.focus) return [{ x: 0, y: 0, w: 9999, h: 9999, act: () => go(returnTo ?? byId(current.focus!.theme), undefined) }];
  if (place === "inn") return [{ x: 0, y: 0, w: 9999, h: 9999, act: () => go(byId("town")) }];
  if (place === "church") return [{ ...churchPriest(art), act: () => {
    document.querySelector<HTMLElement>("#messages")!.textContent = `神父さま「${PRIEST_LINES[priestLine++ % PRIEST_LINES.length]}」`;
  } }, ...PRAYERS.slice(0, churchSlots(art).length).map((prayer, i) => {
    const [x, y] = churchSlots(art)[i];
    return { x: x - 24, y: y - 55, w: 48, h: 70, act: () => commands(prayer.name, x, y, false) };
  }), { x: 430, y: 500, w: 100, h: 34, text: "▼ そとへ", act: () => go(byId("town")) }];
  if (place === "town") {
    const spots: Hot[] = [{ ...townSpots(art).inn, act: () => go(byId("inn")) },
      { ...townSpots(art).church, act: () => go(byId("church")) }];
    for (const hero of townHeroes()) {
      spots.push({ x: hero.x - 16, y: hero.y - 76, w: 32, h: 80, act: () => commands(hero.name, hero.x, hero.y, false) });
    }
    spots.push({ x: 8, y: 8, w: 130, h: 22, text: "◀ ワールドマップ", act: () => go(byId("world")) });
    spots.push({ ...rosterPlate, act: () => showRoster(reportRoot, ROSTER, (name) => { recall(art, name); toast(`${name} を よびもどした！ もんから もどってくる`); }) });
    if (gateMenu) {
      (["meadow", "cave", "forest"] as const).forEach((theme, i) => spots.push({
        x: 410, y: 404 + i * 20, w: 140, h: 18, text: `▶ ${byId(theme).label}`, act: () => go(byId(theme)),
      }));
    } else {
      spots.push({ x: 430, y: 488, w: 100, h: 52, text: "▼ フィールドへ", act: () => { gateMenu = true; } });
    }
    return spots;
  }
  if (!place) return [];
  const exits: Hot[] = FIELD_EXITS[place].map((exit) => ({ x: exit.x - 44, y: exit.y - 14, w: 88, h: 22, text: exit.text, act: () => go(byId(exit.to)) }));
  for (const fight of FIGHTS[place]) {
    if (fight.done) {
      exits.push({ x: fight.x + 26, y: fight.y - 50, w: 40, h: 56, act: () => openReport(fight.name) });
      exits.push({ x: fight.x - 22, y: fight.y - 60, w: 44, h: 66, act: () => commands(fight.name, fight.x, fight.y, false) });
      continue;
    }
    const target = SCENES.find((s) => s.focus?.monster === fight.monster && s.focus.theme === place) ?? SCENES.find((s) => s.focus?.monster === fight.monster)!;
    exits.push({ x: fight.x - 22, y: fight.y - 60, w: 44, h: 66, act: () => commands(fight.name, fight.x, fight.y, true, () => go(target, current)) });
  }
  return exits;
}

function hit(x: number, y: number): Hot | undefined {
  return hotspots().find((h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
}

function updateTabs(now: number): void {
  for (const button of tabs.querySelectorAll<HTMLButtonElement>("button")) {
    const scene = byId(button.dataset.id!);
    const theme = scene.place && scene.place !== "town" && scene.place !== "inn" && scene.place !== "church" && scene.place !== "world" ? scene.place : undefined;
    const count = button.querySelector<HTMLElement>(".count");
    const alert = button.querySelector<HTMLElement>(".alert");
    if (!count || !alert) continue;
    if (scene.place === "world") count.textContent = `🏰 ${PROJECTS.length}`;
    else if (scene.place === "town") count.textContent = `👤 ${7 + 3}`;
    else if (scene.place === "inn") count.textContent = `💤 ${SLEEPERS.length}`;
    else if (scene.place === "church") count.textContent = `祈り ${PRAYERS.length}`;
    else if (theme) count.textContent = `⚔️ ${FIGHTS[theme].filter((f) => !f.done).length}`;
    if (scene.place === "town") button.querySelector(".name")!.textContent = town.repo;
    const unread = theme !== undefined && FIGHTS[theme].some((f) => f.done && !read.has(f.name))
      || scene.place === "town" && TOWN_REPORTS.some((r) => !read.has(r.name));
    const trouble = unread || theme !== undefined && current.place !== theme
      && FIGHTS[theme].some((fight) => { const c = (now + fight.x * 7) % 4200; return !fight.done && c > 2600 && c < 3600; });
    alert.style.visibility = trouble || (scene.place === "town" && current.place !== "town") ? "visible" : "hidden";
  }
}

function frame(now: number): void {
  const dt = Math.min(100, now - last);
  last = now;
  const fade = (now - fadeAt) / 300;
  if (pending && fade >= 1) { show(pending); pending = undefined; fadeAt = now; }
  const [w, h] = size(current);
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  if (current.place === "world") sleepingPlate = drawWorld(ctx, art, now, w, h, PROJECTS);
  else if (current.place === "town") {
    walkTown(art, now);
    drawTown(ctx, art, now, { sleepers: SLEEPERS.length, prayers: PRAYERS.length, theme: town.theme, name: town.repo, walkers: current.id === "equipment-town" ? equippedWalkers : walkers, reports: current.id === "equipment-town" ? [] : townReports(), caller: current.id === "equipment-town" ? undefined : CALLER, read });
    rosterPlate = plate(ctx, [[`📖 ぼうけんしゃの めいぼ ${ROSTER.length}`, "#fff7d6", 10]], w - 92, 8);
  }
  else if (current.place === "inn") drawInn(ctx, art, now, SLEEPERS);
  else if (current.place === "church") drawChurch(ctx, art, now, PRAYERS);
  else if (current.place) drawField(ctx, art, current.place, now, FIGHTS[current.place], read);
  else if (current.focus && ambient) drawFocus(ctx, art, battleBeat(current.focus, now), ambient, now, dt, w, h);
  drawNavigation(ctx, hotspots(), pointer, gateMenu);

  if (current.focus && returnTo) label(ctx, "クリックで もどる", w - 60, 58, "#ffe066", 9);
  const flash = (now - fadeAt) / 300;
  if (flash < 1 || pending) {
    ctx.fillStyle = current.focus || returnTo ? `rgba(255,255,255,${pending ? flash : 1 - flash})` : `rgba(0,0,0,${pending ? Math.min(1, flash) : Math.max(0, 1 - flash)})`;
    ctx.fillRect(0, 0, w, h);
  }
  updateTabs(now);
  requestAnimationFrame(frame);
}

function mapPoint(event: MouseEvent): [number, number] {
  const rect = canvas.getBoundingClientRect();
  const [w, h] = size(current);
  return [(event.clientX - rect.left) * w / rect.width, (event.clientY - rect.top) * h / rect.height];
}

canvas.addEventListener("mousemove", (event) => {
  pointer = mapPoint(event);
  canvas.style.cursor = hit(...pointer) ? "pointer" : "default";
});
canvas.addEventListener("click", (event) => {
  const spot = hit(...mapPoint(event));
  if (spot) spot.act();
  else gateMenu = false;
});

// Equipment samples are direct scene URLs; keep the existing review tabs pixel-identical.
for (const scene of SCENES.filter((scene) => !scene.id.startsWith("equipment-"))) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.id = scene.id;
  button.innerHTML = `<span class="name"></span><span class="count"></span><span class="alert">❗</span>`;
  button.querySelector(".name")!.textContent = scene.label;
  if (scene.focus) button.querySelector(".count")!.remove();
  button.addEventListener("click", () => { returnTo = undefined; show(scene); });
  tabs.append(button);
}
void (async () => {
  await art.load();
  initTown(art);
  await document.fonts.load('10px "DotGothic16"');
  show(current);
  refreshHerald();
  requestAnimationFrame(frame);
})();
