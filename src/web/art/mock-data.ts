import type { Theme } from "../town/ambient";
import type { Fight } from "../town/field";
import type { Project } from "../town/world";
import type { Sheets } from "../town/sheets";
import { leave, makeWalker, returnWalker, stepWalkers, type Departed, type Walker } from "../town/walkers";

export const FIGHTS: Record<Theme, Fight[]> = {
  meadow: [
    { x: 250, y: 210, name: "t12-vitals", level: 4, variant: 0, monster: "monster-slime", target: "room.ts", party: [], fx: "claw" },
    { x: 560, y: 190, name: "t3-ui", level: 4, variant: 2, monster: "monster-slime", target: "scene.ts", party: [], fx: "claw" },
    { x: 360, y: 430, name: "t8-terminal", level: 4, variant: 1, monster: "monster-dragon", target: "Explore", party: ["party-warrior", "party-mage"], fx: "fire" },
    { x: 640, y: 440, name: "t19-search", level: 5, variant: 3, monster: "monster-slime", target: "room.ts", party: [], fx: "claw", done: true },
  ],
  cave: [
    { x: 260, y: 230, name: "t1-core", level: 4, variant: 3, monster: "monster-golem", target: "npm test", party: [], fx: "rocks" },
    { x: 520, y: 420, name: "t5-hooks", level: 4, variant: 4, monster: "monster-golem", target: "npm run typecheck", party: ["party-thief"], fx: "rocks" },
    { x: 700, y: 250, name: "t20-tests", level: 5, variant: 2, monster: "monster-golem", target: "npm run typecheck", party: [], fx: "rocks", done: true },
  ],
  forest: [
    { x: 300, y: 250, name: "t10-render", level: 4, variant: 1, monster: "monster-ghost", target: "npm run build", party: [], fx: "curse" },
    { x: 560, y: 430, name: "t7-server", level: 4, variant: 2, monster: "monster-ghost", target: "git push", party: ["party-priest"], fx: "curse" },
    { x: 640, y: 170, name: "t21-build", level: 5, variant: 4, monster: "monster-ghost", target: "npm run build", party: [], fx: "curse", done: true },
  ],
};
for (const fights of Object.values(FIGHTS)) for (const fight of fights) { fight.demo = true; fight.damage = { hero: 23, enemy: 12 }; }

export const PROJECTS: Project[] = [
  { repo: "agent-character", theme: "village", heroes: 18, fighting: 7, unread: 5, calling: true },
  { repo: "blog", theme: "village", heroes: 1, fighting: 0, unread: 1, calling: false },
  { repo: "shop-front", theme: "port", heroes: 3, fighting: 1, unread: 1, calling: false },
  { repo: "shop-api", theme: "port", heroes: 2, fighting: 2, unread: 0, calling: true },
  { repo: "shop-admin", theme: "port", heroes: 1, fighting: 0, unread: 2, calling: false },
  { repo: "payments", theme: "port", heroes: 2, fighting: 1, unread: 0, calling: false },
  { repo: "mail-worker", theme: "port", heroes: 1, fighting: 1, unread: 0, calling: false },
  { repo: "search-index", theme: "port", heroes: 1, fighting: 0, unread: 1, calling: false },
  { repo: "infra-tools", theme: "snow", heroes: 2, fighting: 0, unread: 0, calling: false },
  { repo: "data-pipeline", theme: "desert", heroes: 4, fighting: 2, unread: 2, calling: false },
  { repo: "game-engine", theme: "volcano", heroes: 1, fighting: 1, unread: 0, calling: true },
  { repo: "old-site", theme: "village", heroes: 0, fighting: 0, unread: 0, calling: false },
  { repo: "ml-notebooks", theme: "desert", heroes: 0, fighting: 0, unread: 0, calling: false },
  { repo: "dotfiles", theme: "snow", heroes: 0, fighting: 0, unread: 0, calling: false },
  { repo: "legacy-batch", theme: "volcano", heroes: 0, fighting: 0, unread: 0, calling: false },
  { repo: "new-mobile-app", heroes: 1, fighting: 0, unread: 0, calling: false },
];
export const SLEEPERS = ["t15-infra", "t16-ops"];
export const PRAYERS = [{ name: "t18-compact", variant: 0 }, { name: "t22-context", variant: 2 }];
export const walkers: Walker[] = [];
export function initTown(art: Sheets): void {
  walkers.push(...["t23-lint", "t4-api", "t6-gesture", "t9-fixes", "t13-auth", "t14-db", "t17-ci"].map((name, i) => makeWalker(art, name, name, i % 5, i)));
}
export const CALLER = { name: "t11-callme", x: 560, y: 432 };
export const TOWN_REPORTS = [
  { name: "t5-hooks", x: 345, y: 420, icon: "rolled parchment scroll" },
  { name: "t2-docs", x: 610, y: 400, icon: "speech bubble with lines" },
];
export const ROSTER: Departed[] = [
  { name: "t1-core", repo: "agent-character", left: "きのう 18:20", last: "Room の雛形と relay サーバーを作りました。" },
  { name: "t7-server", repo: "agent-character", left: "きょう 09:05", last: "町の台帳を追加し、使っていない町をしまえるようにしました。" },
];
const gone = new Set<string>();
export const townReports = () => TOWN_REPORTS.filter((r) => !gone.has(r.name));
export const townHeroes = () => [...walkers.filter((w) => !w.leaving), ...townReports(), CALLER];

export function farewell(art: Sheets, name: string): void {
  let walker = walkers.find((w) => w.name === name);
  const reporter = TOWN_REPORTS.find((r) => r.name === name);
  if (!walker && reporter) {
    gone.add(name);
    walker = makeWalker(art, name, name, name.length % 5, 0);
    walker.x = reporter.x; walker.y = reporter.y;
    walkers.push(walker);
  }
  if (walker) leave(art, walker);
}

export function recall(art: Sheets, name: string): void {
  const index = ROSTER.findIndex((d) => d.name === name);
  if (index < 0) return;
  ROSTER.splice(index, 1);
  const taken = new Set(walkers.map((w) => w.stop));
  const stop = Array.from({ length: 10 }, (_, i) => i).find((i) => !taken.has(i)) ?? 0;
  const walker = makeWalker(art, name, name, name.length % 5, stop);
  returnWalker(art, walker);
  walkers.push(walker);
}

let last = 0;
export function walkTown(art: Sheets, t: number): void {
  const departed = stepWalkers(art, walkers, t, Math.min(100, t - last));
  last = t;
  for (const walker of departed) ROSTER.unshift({ name: walker.name, repo: "agent-character", left: "いま", last: "（さいごの ほうこくが ここに のこる）" });
}
