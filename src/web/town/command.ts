import type { Departed } from "./walkers";

// Mock: the command window that opens next to a hero you click (docs/PLATFORM.md).
// In the real app each command goes to that hero's embedded terminal or hook; here they only
// show what would happen.
interface HeroState { name: string; fighting: boolean; hasReport: boolean; at: [number, number] } // at: CSS px in the stage
interface Handlers {
  watch?: () => void; // たたかいを みる (fields only)
  report: () => void; // きろく
  farewell: () => void; // みおくる
  toast: (text: string) => void;
}

const PLANS = ["いったん とまって ほうこくして", "テストを とおして", "コミットして", "ほうしんを みなおして"];

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function place(layer: HTMLElement, box: HTMLElement, at: [number, number], dismiss = () => close(layer)): void {
  layer.classList.add("menu-layer");
  layer.replaceChildren(box);
  layer.hidden = false;
  const width = layer.clientWidth, height = layer.clientHeight;
  const left = Math.min(Math.max(8, at[0] + 24), width - box.offsetWidth - 8);
  const top = Math.min(Math.max(8, at[1] - box.offsetHeight / 2), height - box.offsetHeight - 8);
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;

  const buttons = [...box.querySelectorAll<HTMLButtonElement>(".commands button:not(:disabled)")];
  let selected = 0;
  function select(index: number): void {
    selected = index;
    for (const [i, button] of buttons.entries()) {
      button.classList.toggle("selected", i === selected);
      button.tabIndex = i === selected ? 0 : -1;
      if (i === selected) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }
    buttons[selected]?.focus({ preventScroll: true });
  }
  for (const [index, button] of buttons.entries()) {
    button.addEventListener("mouseenter", () => select(index));
    button.addEventListener("focus", () => { if (selected !== index) select(index); });
  }
  box.addEventListener("keydown", (event) => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); dismiss();
      return;
    }
    if (!buttons.length || event.target instanceof HTMLTextAreaElement) return;
    const direction = event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1
      : event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : 0;
    if (direction) {
      event.preventDefault(); event.stopPropagation();
      select((selected + direction + buttons.length) % buttons.length);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault(); event.stopPropagation(); buttons[selected].click();
    }
  });
  select(0);
}

function close(layer: HTMLElement): void {
  layer.hidden = true;
  layer.classList.remove("menu-layer");
}

function option(label: string, action: () => void, disabled?: string): HTMLButtonElement {
  const button = element("button", undefined, label);
  button.type = "button";
  if (disabled) {
    button.disabled = true;
    button.title = disabled;
  }
  button.addEventListener("click", action);
  return button;
}

// Stage 3 uses the same frame, positioning and buttons as the mock, without its future commands.
export function showHeroCommands(layer: HTMLElement, name: string, at: [number, number], on: {
  talk: () => void; status: () => void; follow: () => void; terminal?: () => void; watch?: () => void; closed: () => void;
}): () => void {
  const box = element("div", "command-window");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", `${name}の コマンド`);
  box.append(element("h4", undefined, name));
  let closed = false;
  const dismiss = () => {
    if (closed) return;
    closed = true;
    close(layer);
    on.closed();
  };
  const choose = (action: () => void) => () => { dismiss(); action(); };
  const list = element("div", "commands");
  if (on.watch) list.append(option("たたかいを みる", choose(on.watch)));
  list.append(option("はなす", choose(on.talk)), option("ようすを みる", choose(on.status)),
    option("ついていく", choose(on.follow)),
    option("ターミナル", choose(on.terminal ?? (() => undefined)), on.terminal ? undefined : "外から来た勇者の ターミナルは ひらけません"),
    option("とじる", dismiss));
  box.append(list);
  if (!on.terminal) box.append(element("p", "hint", "外から来た勇者\nこのアプリの ターミナルでは ない"));
  place(layer, box, at, dismiss);
  return dismiss;
}

export function showCommands(layer: HTMLElement, hero: HeroState, on: Handlers): void {
  const box = element("div", "command-window");
  box.append(element("h4", undefined, hero.name));
  const list = element("div", "commands");
  const done = (text: string) => { close(layer); on.toast(text); };
  if (on.watch) list.append(option("たたかいを みる", () => { close(layer); on.watch!(); }));
  list.append(
    option("めいれい", () => showOrder(layer, hero, done)),
    option("さくせん", () => showPlans(layer, hero, done)),
    option("にげる", () => done(`${hero.name} は たたかいを ちゅうだんした（Esc を おくった）`), hero.fighting ? undefined : "たたかっていない ときは つかえません"),
    option("やすむ", () => done(`${hero.name} は ひとやすみ した（/compact）… MPが かいふくした！`), hero.fighting ? "たたかいの さいちゅうは つかえません" : undefined),
    option("ターミナル", () => undefined, "モックには ターミナルが ありません（本体で ひらく）"),
    option("きろく", () => { close(layer); on.report(); }, hero.hasReport ? undefined : "まだ ほうこくが ありません"),
    option("みおくる", () => showFarewell(layer, hero, on)),
  );
  box.append(list);
  place(layer, box, hero.at);
}

function showOrder(layer: HTMLElement, hero: HeroState, done: (text: string) => void): void {
  const box = element("div", "command-window wide");
  box.append(element("h4", undefined, `${hero.name} に めいれい`));
  box.append(element("p", "hint", hero.fighting
    ? "たたかいの さいちゅう：つぎの こうどうが おわった ときに つたわります。"
    : "まっている ので、すぐに あたらしい いらいとして つたわります。"));
  const form = element("form", "answer");
  const input = element("textarea");
  input.rows = 3;
  input.placeholder = "めいれいを かく（Ctrl+Enter で おくる）";
  const send = element("button", undefined, "▶ つたえる");
  send.type = "submit";
  form.append(input, send);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!input.value.trim()) return;
    done(hero.fighting ? `${hero.name} に「${input.value.trim()}」を つたえる まち…` : `${hero.name} に「${input.value.trim()}」を つたえた！`);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) form.requestSubmit();
  });
  box.append(form);
  place(layer, box, hero.at);
  input.focus();
}

function showPlans(layer: HTMLElement, hero: HeroState, done: (text: string) => void): void {
  const box = element("div", "command-window");
  box.append(element("h4", undefined, "さくせん"));
  const list = element("div", "commands");
  for (const plan of PLANS) list.append(option(plan, () => done(`${hero.name} に さくせん「${plan}」を つたえた`)));
  box.append(list);
  place(layer, box, hero.at);
}

function showFarewell(layer: HTMLElement, hero: HeroState, on: Handlers): void {
  const box = element("div", "command-window wide");
  box.append(element("h4", undefined, `${hero.name} を みおくりますか？`));
  box.append(element("p", "hint", (hero.fighting ? "たたかいの さいちゅうです。ちゅうだんして たびだたせます。\n" : "")
    + "セッションを おわります。ぼうけんしゃの めいぼから いつでも よびもどせます。"));
  const list = element("div", "commands row");
  list.append(option("はい", () => { close(layer); on.farewell(); }), option("いいえ", () => close(layer)));
  box.append(list);
  place(layer, box, hero.at);
}

// The roster of heroes who have set off; call one back to resume the same session.
export function showRoster(layer: HTMLElement, roster: Departed[], onRecall: (name: string) => void): void {
  layer.classList.remove("menu-layer");
  const box = element("div", "report-window");
  box.setAttribute("role", "dialog");
  box.append(element("h3", undefined, `ぼうけんしゃの めいぼ（${roster.length}）`));
  if (!roster.length) box.append(element("p", "who", "まだ だれも たびだって いません。"));
  for (const d of roster) {
    const row = element("div", "roster-row");
    const text = element("div");
    text.append(element("p", "name", `${d.name}（${d.repo}）　${d.left} に たびだった`), element("p", "last", d.last));
    const recall = option("▶ よびもどす", () => { layer.hidden = true; onRecall(d.name); });
    row.append(text, recall);
    box.append(row);
  }
  const actions = element("div", "actions");
  actions.append(option("▶ とじる", () => { layer.hidden = true; }));
  box.append(actions);
  layer.replaceChildren(box);
  layer.hidden = false;
}
