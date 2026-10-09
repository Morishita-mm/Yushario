import { THEME_NAMES, type TownTheme } from "./mock-themes";
import { PROJECTS, type Project } from "./mock-world";

// The herald (でんれい): everything that needs you, across all projects, most urgent first.
// With many projects you don't browse towns; you work down this list.
export interface Notice { kind: "permission" | "call" | "new" | "struggle" | "report"; repo: string; text: string; ago: string }

const ORDER: Notice["kind"][] = ["permission", "call", "new", "struggle", "report"];
const ICONS: Record<Notice["kind"], string> = { permission: "🔑", call: "❗", new: "🏗", struggle: "💦", report: "📜" };

export function notices(): Notice[] {
  const list: Notice[] = [
    { kind: "permission", repo: "shop-api", text: "t3-checkout が「npm publish」の きょかを まっている", ago: "1分前" },
    { kind: "struggle", repo: "data-pipeline", text: "t8-etl が くるしい たたかい（5分で しっぱい3回）", ago: "3分前" },
  ];
  for (const p of PROJECTS) {
    if (!p.theme) list.push({ kind: "new", repo: p.repo, text: `あたらしい町「${p.repo}」が できた！ すがたを えらぼう`, ago: "いま" });
    if (p.calling) list.push({ kind: "call", repo: p.repo, text: `${p.repo} の ゆうしゃが あなたを よんでいる`, ago: "2分前" });
    if (p.unread) list.push({ kind: "report", repo: p.repo, text: `${p.repo} から ほうこくが ${p.unread}件`, ago: "5分前" });
  }
  return list.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function renderHerald(root: HTMLElement, onPick: (notice: Notice) => void): void {
  const list = notices();
  const items = list.map((notice) => {
    const button = element("button", `notice ${notice.kind}`);
    button.type = "button";
    button.append(element("span", "icon", ICONS[notice.kind]), element("span", "text", notice.text), element("span", "ago", notice.ago));
    button.addEventListener("click", () => onPick(notice));
    return button;
  });
  root.replaceChildren(element("h2", undefined, `でんれい（${list.length}）`), ...items);
}

function windowBox(layer: HTMLElement, title: string, onClose: () => void): HTMLElement {
  const box = element("div", "report-window");
  box.setAttribute("role", "dialog");
  box.append(element("h3", undefined, title));
  const close = element("button", undefined, "▶ とじる");
  close.type = "button";
  close.addEventListener("click", () => { layer.hidden = true; onClose(); });
  const actions = element("div", "actions");
  actions.append(close);
  queueMicrotask(() => box.append(actions));
  layer.classList.remove("menu-layer");
  layer.replaceChildren(box);
  layer.hidden = false;
  return box;
}

// A list of towns (a crowded region, or the sleeping towns) to pick from.
export function showTownList(layer: HTMLElement, title: string, projects: Project[], onPick: (p: Project) => void, onClose: () => void): void {
  const box = windowBox(layer, title, onClose);
  const list = element("div", "town-list");
  for (const p of projects) {
    const button = element("button", "town-row");
    button.type = "button";
    const status = p.heroes ? [`👤${p.heroes}`, p.fighting ? `⚔️${p.fighting}` : "", p.unread ? `📜${p.unread}` : "", p.calling ? "❗" : ""].filter(Boolean).join("  ") : "だれも いない";
    button.append(element("span", "name", p.repo), element("span", "status", status));
    button.addEventListener("click", () => { layer.hidden = true; onPick(p); });
    list.append(button);
  }
  box.append(list);
}

// The first visit to a new town: choose what it looks like (and so its region on the map).
export function showThemeChooser(layer: HTMLElement, project: Project, icon: (theme: TownTheme) => HTMLCanvasElement, onPick: (theme: TownTheme) => void, onClose: () => void): void {
  const box = windowBox(layer, `「${project.repo}」の 町の すがたを えらぶ`, onClose);
  box.append(element("p", "who", "えらんだ すがたの 地方に 町が できます。あとから かえられます。"));
  const list = element("div", "theme-list");
  for (const theme of Object.keys(THEME_NAMES) as TownTheme[]) {
    const button = element("button", "theme-option");
    button.type = "button";
    button.append(icon(theme), element("span", undefined, THEME_NAMES[theme]));
    button.addEventListener("click", () => { layer.hidden = true; onPick(theme); });
    list.append(button);
  }
  box.append(list);
}
