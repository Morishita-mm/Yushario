import "@fontsource/dotgothic16/400.css";
import "./gallery.css";
import { iconLabel } from "../icons.js";

// Review page for the pixel-art components in public/art (see docs/ART.md), ordered by section.
interface Entry {
  id: string; group: string; sub?: string; use?: string; name: string;
  frame: [number, number]; frames: string[]; colors: number; warning?: string;
}

const SECTIONS: Record<string, string[]> = {
  キャラクター: ["勇者（マップ用）", "勇者（戦闘フォーカス用）", "仲間（マップ用）", "仲間（戦闘フォーカス用）"],
  モンスター: ["横向き（マップ用）", "正面（戦闘フォーカス用）", "正面の攻撃（戦闘フォーカス用）"],
  まち: ["建物", "広場・小物", "宿屋の中", "きょうかいの中", "町のタイプ：海辺の港町", "町のタイプ：雪国の町", "町のタイプ：砂漠のオアシス", "町のタイプ：火山の町"],
  フィールド: ["ワールドマップ", "地面", "自然・水辺", "洞窟・夜の森", "戦闘背景（戦闘フォーカス用）", "背景の動き"],
  演出: ["エフェクト", "UI"],
};

const gallery = document.querySelector<HTMLElement>("#gallery")!;
const nav = document.querySelector<HTMLElement>("#sections")!;
const zoomSelect = document.querySelector<HTMLSelectElement>("#zoom")!;
const backdrop = document.querySelector<HTMLSelectElement>("#backdrop")!;
const players: (() => void)[] = [];

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function card(entry: Entry, image: HTMLImageElement): HTMLElement {
  const zoom = Number(zoomSelect.value);
  const [w, h] = entry.frame;
  const root = element("article", "card");
  root.id = entry.id;
  root.append(element("h4", undefined, entry.name),
    element("p", "id", `${entry.id} ・ ${entry.frames.length}コマ ・ 1コマ ${w}×${h} ・ ${entry.colors}色`));
  if (entry.use) root.append(element("p", "use", `使う場面：${entry.use}`));
  if (entry.warning) {
    const warning = element("p", "warning");
    warning.append(iconLabel("warning", entry.warning));
    root.append(warning);
  }
  const sheet = element("canvas", "sheet");
  sheet.width = image.width * zoom;
  sheet.height = image.height * zoom;
  const ctx = sheet.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, sheet.width, sheet.height);
  const labels = element("div", "labels");
  labels.style.gridTemplateColumns = `repeat(${entry.frames.length}, ${w * zoom}px)`;
  entry.frames.forEach((name, index) => labels.append(element("span", undefined, `${index + 1}. ${name}`)));
  const strip = element("div", "strip");
  strip.append(sheet, labels);
  root.append(strip);
  if (entry.frames.length > 1) {
    const anim = element("canvas", "anim");
    anim.width = w * zoom;
    anim.height = h * zoom;
    const actx = anim.getContext("2d")!;
    actx.imageSmoothingEnabled = false;
    let index = 0;
    players.push(() => {
      actx.clearRect(0, 0, anim.width, anim.height);
      actx.drawImage(image, index * w, 0, w, h, 0, 0, anim.width, anim.height);
      index = (index + 1) % entry.frames.length;
    });
    const box = element("div", "play");
    box.append(element("span", undefined, "再生"), anim);
    root.append(box);
  }
  return root;
}

async function render(): Promise<void> {
  players.length = 0;
  const entries: Entry[] = await (await fetch("/art/manifest.json", { cache: "no-store" })).json();
  gallery.replaceChildren();
  nav.replaceChildren();
  const images = new Map(await Promise.all(entries.map(async (entry) => {
    const image = new Image();
    image.src = `/art/${entry.id}.png?${Date.now()}`;
    await image.decode();
    return [entry.id, image] as const;
  })));
  const known = new Set(Object.entries(SECTIONS).flatMap(([group, subs]) => subs.map((sub) => `${group}/${sub}`)));
  const sections: [string, string[]][] = [...Object.entries(SECTIONS), ["その他", [""]]];
  for (const [group, subs] of sections) {
    const inGroup = entries.filter((e) => group === "その他" ? !known.has(`${e.group}/${e.sub}`) : e.group === group);
    if (!inGroup.length) continue;
    const section = element("section");
    section.id = `s-${group}`;
    section.append(element("h2", undefined, `${group}（${inGroup.length}）`));
    for (const sub of subs) {
      const items = group === "その他" ? inGroup : inGroup.filter((e) => e.sub === sub);
      if (!items.length) continue;
      const block = element("details");
      block.open = true;
      block.append(element("summary", undefined, `${sub || "未分類"}（${items.length}）`));
      for (const entry of items) block.append(card(entry, images.get(entry.id)!));
      section.append(block);
    }
    gallery.append(section);
    const link = element("a", undefined, `${group} ${inGroup.length}`);
    link.href = `#s-${group}`;
    nav.append(link);
  }
}

zoomSelect.addEventListener("change", () => void render());
backdrop.addEventListener("change", () => { document.body.dataset.backdrop = backdrop.value; });
document.body.dataset.backdrop = backdrop.value;
setInterval(() => players.forEach((play) => play()), 300);
void render();
