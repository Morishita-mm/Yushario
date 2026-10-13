import "@fontsource/dotgothic16/400.css";
import "./gallery.css";
import { Ambient } from "../town/ambient";
import { drawFocus } from "../town/battle";
import { drawField, FIELD_EXITS } from "../town/field";
import { REPORTS } from "./mock-report";
import { showReport } from "../town/report";
import type { TownTheme } from "../town/themes";
import { showBattleCommands } from "../town/battle-commands";
import { showRoster } from "../town/command";
import { mockHeroCommands } from "./mock-heroes";
import { drawInn } from "../town/inn";
import { drawChurch, PRIEST_LINES } from "../town/church";
import { interiorHotspots } from "./mock-interior";
import { drawTown, townSpots } from "../town/town";
import { FIGHTS, PROJECTS, farewell, recall, ROSTER, SLEEPERS, PRAYERS, TOWN_REPORTS, townHeroes, walkers, equippedWalkers, townReports, CALLER, walkTown, initTown, heroPlace } from "./mock-data";
import { notices } from "./mock-notices";
import { renderHerald, showTownList, showThemeChooser, type Notice } from "../town/herald";
import { drawWorld, markers, plate, regionName, sleeping, type Project } from "../town/world";
import { Sheets } from "../town/sheets";
import { drawNavigation } from "../town/navigation";
import { battleBeat } from "./mock-battle-data";
import { noticeMarkMotion } from "../../core/notice-mark";
import { initSideTabs } from "../town/side-tabs";
import { renderMockParty } from "./mock-party";
import { drawNoticeArrow } from "../town/notice-mark";
import { SCENES, sceneSize, initSceneTabs, type Place, type Scene } from "./mock-scenes";
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
// Notice target: starts when its scene appears, ends after 3s, on its click, or on leaving.
let mark: { id: string; place: Place; at?: number } | undefined;
const herald = document.querySelector<HTMLElement>("#herald")!;
const party = document.querySelector<HTMLElement>("#party")!;
const sideTabs = initSideTabs();

// Entering a town; a town whose kind is not chosen yet asks first.
function enter(project: Project, place: Place = "town"): void {
  if (!project.theme) {
    showThemeChooser(reportRoot, project, art, (theme) => { project.theme = theme; refreshHerald(); enter(project); }, () => undefined);
    return;
  }
  town = { theme: project.theme, repo: project.repo };
  initTown(art, town.theme);
  go(byId(place));
}

let picked: string | undefined; // The mock hero chosen in the ゆうしゃ tab.
// Like the app: inside a town only its notices; the ゆうしゃ tab lists the mock town's heroes.
function refreshHerald(): void {
  const list = notices().filter((notice) => current.place === "world" || notice.repo === town.repo);
  sideTabs.count("herald", list.length);
  sideTabs.count("party", renderMockParty(party, town.repo, mark?.id ?? picked, (name, place) => { picked = name; mark = { id: name, place }; go(byId(place)); }));
  renderHerald(herald, list, (notice: Notice) => {
    if (notice.hero) sideTabs.show("party");
    const project = PROJECTS.find((p) => p.repo === notice.repo);
    const place = notice.hero ? heroPlace(notice.hero) : undefined;
    mark = notice.hero && place ? { id: notice.hero, place } : undefined;
    if (project) enter(project, place);
  });
}
const read = new Set<string>();
let report: string | undefined; // name of the agent whose report is open
const reportRoot = document.querySelector<HTMLElement>("#report")!;

function openReport(name: string): void {
  if (mark?.id === name) mark = undefined;
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
  if (event.target !== reportRoot) return;
  closeLayer();
  if (current.focus) go(returnTo ?? byId(current.focus.theme), undefined); // Outside the battle commands: back.
});

const byId = (id: string) => SCENES.find((s) => s.id === id)!;
const size = (scene: Scene) => sceneSize(art, scene);

function show(scene: Scene): void {
  current = scene;
  gateMenu = false;
  refreshHerald();
  if (mark && mark.at === undefined && mark.place === scene.place && !scene.focus) mark.at = performance.now();
  else mark = undefined;
  ambient = scene.focus ? new Ambient(art, scene.focus.theme, scene.focus.backdrop) : undefined;
  const [w, h] = size(scene);
  canvas.width = w * SCALE;
  canvas.height = h * SCALE;
  caption.textContent = scene.caption;
  for (const button of tabs.querySelectorAll<HTMLButtonElement>("button")) button.classList.toggle("on", button.dataset.id === scene.id);
}

function go(scene: Scene, from?: Scene): void {
  returnTo = scene.focus ? from : undefined;
  if (scene.focus || current.focus) { fadeAt = performance.now(); show(scene); if (scene.focus) battleCommands(); return; }
  pending = scene;
  fadeAt = performance.now();
}

// Same window as the app; the fake hero only shows what would be sent.
function battleCommands(): void {
  const rect = canvas.getBoundingClientRect(), [w, h] = size(current), name = current.focus!.status[0]?.name ?? "ゆうしゃ";
  showBattleCommands(reportRoot, name, [(w - 8) * rect.width / w, (h - 50) * rect.height / h], {
    working: true, closed: () => undefined,
    steer: async (text) => { toast(`${name}に「${text}」を つたえた！`); return `${name}に つたえた！`; },
    interrupt: () => toast(`${name} は たたかいから にげだした！`),
    back: () => go(returnTo ?? byId(current.focus!.theme), undefined),
  });
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
  if (mark?.id === name) mark = undefined;
  const rect = canvas.getBoundingClientRect();
  const [w, h] = size(current);
  mockHeroCommands(reportRoot, name, [x * rect.width / w, (y - 30) * rect.height / h], fighting, walkers, {
    watch, toast,
    talk: () => REPORTS[name] ? openReport(name) : toast(`${name}は こちらを みている`),
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
  if (current.focus) {
    const [w, h] = size(current);
    return [{ x: w / 2 - 130, y: h - 112, w: 260, h: 66, act: battleCommands },
      { x: 0, y: 0, w: 9999, h: 9999, act: () => go(returnTo ?? byId(current.focus!.theme), undefined) }];
  }
  if (place === "inn" || place === "church") return interiorHotspots(art, place,
    (name, x, y) => commands(name, x, y, false), () => go(byId("town")), () => {
      document.querySelector<HTMLElement>("#messages")!.textContent = `神父さま「${PRIEST_LINES[priestLine++ % PRIEST_LINES.length]}」`;
    });
  if (place === "town") {
    const spots: Hot[] = [{ ...townSpots(art, town.theme).inn, act: () => go(byId("inn")) },
      { ...townSpots(art, town.theme).church, act: () => go(byId("church")) }];
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
  const motion = mark?.at === undefined ? undefined : noticeMarkMotion(Math.max(0, now - mark.at));
  if (mark?.at !== undefined && !motion) mark = undefined;
  const notice = mark && motion ? { id: mark.id, ...motion } : undefined;
  if (current.place === "world") sleepingPlate = drawWorld(ctx, art, now, w, h, PROJECTS);
  else if (current.place === "town") {
    walkTown(art, now);
    drawTown(ctx, art, now, { sleepers: SLEEPERS.length, prayers: PRAYERS.length, theme: town.theme, name: town.repo, walkers: current.id === "equipment-town" ? equippedWalkers : walkers, reports: current.id === "equipment-town" ? [] : townReports(), caller: current.id === "equipment-town" ? undefined : CALLER, read, notice });
    rosterPlate = plate(ctx, [[`📖 ぼうけんしゃの めいぼ ${ROSTER.length}`, "#fff7d6", 10]], w - 92, 8);
  }
  else if (current.place === "inn") drawInn(ctx, art, now, SLEEPERS.map((name) => ({ id: name, name })), notice, town.repo);
  else if (current.place === "church") drawChurch(ctx, art, now, PRAYERS.map((prayer) => ({ id: prayer.name, ...prayer })), notice, town.repo);
  else if (current.place) drawField(ctx, art, current.place, now, FIGHTS[current.place], read, 0, notice, town.repo);
  else if (current.focus && ambient) drawFocus(ctx, art, battleBeat(current.focus, now), ambient, now, dt, w, h);
  drawNoticeArrow(ctx, notice);
  drawNavigation(ctx, hotspots(), pointer, gateMenu);

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

initSceneTabs(tabs, (scene) => { returnTo = undefined; show(scene); });
void (async () => {
  await art.load();
  initTown(art, town.theme);
  await document.fonts.load('10px "DotGothic16"');
  show(current);
  refreshHerald();
  requestAnimationFrame(frame);
})();
