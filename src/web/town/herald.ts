import { tr } from "../language";
import { THEME_NAMES, type TownTheme } from "./themes";
import { ICON, type Project } from "./world";
import type { Sheets } from "./sheets";

// The herald (でんれい): everything that needs you, across all projects, most urgent first.
// With many projects you don't browse towns; you work down this list.
export interface Notice { kind: "permission" | "party-invite" | "outside-role" | "call" | "down" | "new" | "struggle" | "report"; repo: string; text: string; ago: string; hero?: string; at?: number; id?: string }
export const NOTICE_ORDER: Notice["kind"][] = ["permission", "party-invite", "outside-role", "call", "down", "new", "struggle", "report"];
export function noticesInTown(list: Notice[], town?: string): Notice[] {
  return list.filter((notice) => town === undefined || notice.repo === town || ["permission", "party-invite", "outside-role", "call", "down"].includes(notice.kind));
}

const ICONS: Record<Notice["kind"], string> = { permission: "🔑", "party-invite": "👥", "outside-role": "⚠", call: "❗", down: "⚠", new: "🏗", struggle: "💦", report: "📜" };

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Grouped by town, most urgent town first (the list arrives sorted); each heading counts the kinds.
export function renderHerald(root: HTMLElement, list: Notice[], onPick: (notice: Notice) => void, town?: string, townName: (key: string) => string = (key) => key): void {
  const existing = [...root.querySelectorAll<HTMLButtonElement>(".notice")];
  const headings = [...root.querySelectorAll<HTMLElement>(".herald-town")];
  const towns = new Map<string, Notice[]>();
  for (const notice of list) towns.set(notice.repo, [...(towns.get(notice.repo) ?? []), notice]);
  const groups = [...towns];
  const local = town === undefined ? groups : groups.filter(([repo]) => repo === town);
  const other = town === undefined ? [] : groups.filter(([repo]) => repo !== town);
  const otherHeading = root.querySelector<HTMLElement>(".herald-other") ?? element("h2", "herald-other", tr("ほかの町", "Other towns"));
  const nodes = [...local.flatMap(group), ...(other.length ? [otherHeading, ...other.flatMap(group)] : [])];
  if (root.children.length !== nodes.length || nodes.some((node, index) => root.children[index] !== node)) root.replaceChildren(...nodes);

  function group([repo, notices]: [string, Notice[]]): HTMLElement[] {
    const heading = headings.find((item) => item.dataset.town === repo) ?? element("h3", "herald-town");
    heading.dataset.town = repo;
    const counts = (Object.keys(ICONS) as Notice["kind"][]).map((kind) => [kind, notices.filter((n) => n.kind === kind).length] as const)
      .filter(([, n]) => n).map(([kind, n]) => `${ICONS[kind]}${n}`).join(" ");
    const text = `${townName(repo) || tr("（町なし）", "(No town)")}  ${counts}`;
    if (heading.textContent !== text) heading.textContent = text;
    return [heading, ...items(notices)];
  }

  function items(notices: Notice[]): HTMLButtonElement[] { return notices.map((notice) => {
    const key = JSON.stringify([notice.kind, notice.repo, notice.hero, notice.at, notice.text, notice.id]);
    const button = existing.find((item) => item.dataset.notice === key) ?? element("button", `notice ${notice.kind}`);
    button.type = "button"; button.dataset.notice = key;
    button.setAttribute("aria-label", notice.text);
    if (!button.children.length) button.append(element("span", "icon", ICONS[notice.kind]), element("span", "text", notice.text), element("span", "ago"));
    button.querySelector(".ago")!.textContent = notice.ago;
    button.onclick = () => onPick(notice);
    return button;
  }); }
}

export function windowBox(layer: HTMLElement, title: string, onClose: () => void): HTMLElement {
  const box = element("div", "report-window");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", title);
  box.append(element("h3", undefined, title));
  const close = element("button", undefined, tr("▶ とじる", "▶ Close"));
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
export function showTownList(layer: HTMLElement, title: string, projects: Project[], onPick: (p: Project) => void, onClose: () => void, onPin?: (p: Project) => Promise<void>): void {
  const box = (!layer.hidden && layer.querySelector<HTMLElement>('[data-town-list="town"]')) || windowBox(layer, title, onClose);
  box.dataset.townList = "town";
  box.setAttribute("aria-label", title);
  box.querySelector("h3")!.textContent = title;
  const list = box.querySelector<HTMLElement>(".town-list") ?? element("div", "town-list");
  const focused = box.contains(document.activeElement) ? document.activeElement as HTMLElement : undefined;
  const focusedIndex = [...list.children].findIndex((row) => row.contains(focused ?? null));
  list.querySelector(".who")?.remove();
  for (const [index, p] of projects.entries()) {
    const row = [...list.children].find((node) => (node as HTMLElement).dataset.repo === p.repo) as HTMLElement | undefined
      ?? element("div", "town-entry");
    row.dataset.repo = p.repo;
    let button = row.querySelector<HTMLButtonElement>(".town-row");
    if (!button) {
      button = element("button", "town-row"); button.type = "button";
      button.append(element("span", "name"), element("span", "status"));
      row.append(button);
    }
    const status = p.heroes ? [`👤${p.heroes}`, p.fighting ? `⚔️${p.fighting}` : "", p.unread ? `📜${p.unread}` : "", p.calling ? "❗" : ""].filter(Boolean).join("  ") : tr("だれも いない", "No heroes");
    button.querySelector(".name")!.textContent = p.label ?? p.repo;
    button.querySelector(".status")!.textContent = status;
    button.onclick = () => { layer.hidden = true; onPick(p); };
    if (onPin && p.pinned !== undefined) {
      const pin = row.querySelector<HTMLButtonElement>(".town-pin") ?? element("button", "town-pin");
      pin.type = "button";
      pin.textContent = p.pinned ? tr("◆ ピンどめ中", "◆ Pinned") : tr("◇ ピンどめ", "◇ Pin");
      pin.setAttribute("aria-label", tr(`${p.label ?? p.repo}の ピンどめ`, `Pin ${p.label ?? p.repo}`));
      pin.setAttribute("aria-pressed", String(p.pinned));
      pin.onclick = () => {
        pin.disabled = true;
        void onPin(p).finally(() => { pin.disabled = false; });
      };
      if (!pin.parentElement) row.append(pin);
    } else row.querySelector(".town-pin")?.remove();
    if (list.children[index] !== row) list.insertBefore(row, list.children[index] ?? null);
  }
  for (const row of [...list.children]) if (!projects.some((p) => p.repo === (row as HTMLElement).dataset.repo)) row.remove();
  if (!projects.length) list.append(element("p", "who", tr("町は ありません。", "No towns yet.")));
  if (!list.parentElement) box.append(list);
  if (focused && document.activeElement !== focused) {
    const target = focused.isConnected ? focused : list.children[Math.min(Math.max(0, focusedIndex), list.children.length - 1)]?.querySelector<HTMLButtonElement>("button:not(:disabled)") ?? box.querySelector<HTMLButtonElement>(".actions button");
    target?.focus();
  }
}

export function showArchivedTowns(layer: HTMLElement, projects: Project[], onRestore: (p: Project) => Promise<void>, onClose: () => void): void {
  const title = tr(`しまった町（${projects.length}）`, `Archived towns (${projects.length})`);
  const box = (!layer.hidden && layer.querySelector<HTMLElement>('[data-town-list="archived"]')) || windowBox(layer, title, onClose);
  box.dataset.townList = "archived";
  box.setAttribute("aria-label", title);
  box.querySelector("h3")!.textContent = title;
  const list = box.querySelector<HTMLElement>(".town-list") ?? element("div", "town-list");
  const focused = box.contains(document.activeElement) ? document.activeElement as HTMLElement : undefined;
  const focusedIndex = [...list.children].findIndex((row) => row.contains(focused ?? null));
  list.querySelector(".who")?.remove();
  for (const [index, project] of projects.entries()) {
    const row = [...list.children].find((node) => (node as HTMLElement).dataset.repo === project.repo) as HTMLElement | undefined
      ?? element("div", "town-row");
    row.dataset.repo = project.repo;
    if (!row.children.length) row.append(element("span", "name", project.label ?? project.repo), element("button", undefined, tr("▶ もどす", "▶ Restore")));
    const restore = row.querySelector<HTMLButtonElement>("button")!;
    restore.type = "button";
    restore.setAttribute("aria-label", tr(`${project.label ?? project.repo}を もどす`, `Restore ${project.label ?? project.repo}`));
    restore.onclick = () => {
      restore.disabled = true;
      void onRestore(project).finally(() => { restore.disabled = false; });
    };
    if (list.children[index] !== row) list.insertBefore(row, list.children[index] ?? null);
  }
  for (const row of [...list.children]) if (!projects.some((p) => p.repo === (row as HTMLElement).dataset.repo)) row.remove();
  if (!projects.length) list.append(element("p", "who", tr("しまった町は ありません。", "No archived towns.")));
  if (!list.parentElement) box.append(list);
  if (focused && document.activeElement !== focused) {
    const target = focused.isConnected ? focused : list.children[Math.min(Math.max(0, focusedIndex), list.children.length - 1)]?.querySelector<HTMLButtonElement>("button:not(:disabled)") ?? box.querySelector<HTMLButtonElement>(".actions button");
    target?.focus();
  }
}

// The first visit to a new town: choose what it looks like (and so its region on the map).
export function showThemeChooser(layer: HTMLElement, project: Project, art: Sheets, onPick: (theme: TownTheme) => void, onClose: () => void): void {
  const box = windowBox(layer, tr(`「${project.label ?? project.repo}」の 町の すがたを えらぶ`, `Choose a look for ${project.label ?? project.repo}`), onClose);
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
