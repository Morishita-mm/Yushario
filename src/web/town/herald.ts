import { THEME_NAMES, type TownTheme } from "./themes";
import { ICON, type Project } from "./world";
import type { Sheets } from "./sheets";

// The herald (でんれい): everything that needs you, across all projects, most urgent first.
// With many projects you don't browse towns; you work down this list.
export interface Notice { kind: "permission" | "call" | "new" | "struggle" | "report"; repo: string; text: string; ago: string }

const ICONS: Record<Notice["kind"], string> = { permission: "🔑", call: "❗", new: "🏗", struggle: "💦", report: "📜" };

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function renderHerald(root: HTMLElement, list: Notice[], onPick: (notice: Notice) => void): void {
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
export function showThemeChooser(layer: HTMLElement, project: Project, art: Sheets, onPick: (theme: TownTheme) => void, onClose: () => void): void {
  const box = windowBox(layer, `「${project.repo}」の 町の すがたを えらぶ`, onClose);
  box.append(element("p", "who", "えらんだ すがたの 地方に 町が できます。あとから かえられます。"));
  const list = element("div", "theme-list");
  for (const theme of Object.keys(THEME_NAMES) as TownTheme[]) {
    const button = element("button", "theme-option");
    button.type = "button";
    const icon = document.createElement("canvas"), [w, h] = art.size("world-towns");
    icon.width = w * 2; icon.height = h * 2;
    const ctx = icon.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    art.draw(ctx, "world-towns", ICON[theme], w, h * 2, false, 2);
    button.append(icon, element("span", undefined, THEME_NAMES[theme]));
    button.addEventListener("click", () => { layer.hidden = true; onPick(theme); });
    list.append(button);
  }
  box.append(list);
}
