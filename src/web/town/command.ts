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

const PLANS = ["テストを とおして", "コミットして", "ほうしんを みなおして"];

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function place(layer: HTMLElement, box: HTMLElement, at: [number, number], dismiss = () => close(layer), initial = 0): void {
  layer.classList.add("menu-layer");
  layer.replaceChildren(box);
  layer.hidden = false;
  const width = layer.clientWidth, height = layer.clientHeight;
  const left = Math.min(Math.max(8, at[0] + 24), width - box.offsetWidth - 8);
  const top = Math.min(Math.max(8, at[1] - box.offsetHeight / 2), height - box.offsetHeight - 8);
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;

  const enabled = () => [...box.querySelectorAll<HTMLButtonElement>(".commands button:not(:disabled)")];
  let selected: HTMLButtonElement | undefined;
  function select(index: number): void {
    selected = enabled()[index];
    for (const button of box.querySelectorAll<HTMLButtonElement>(".commands button")) {
      button.classList.toggle("selected", button === selected);
      button.tabIndex = button === selected ? 0 : -1;
      if (button === selected) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }
    selected?.focus({ preventScroll: true });
  }
  for (const button of box.querySelectorAll<HTMLButtonElement>(".commands button")) {
    button.addEventListener("mouseenter", () => { if (!button.disabled) select(enabled().indexOf(button)); });
    button.addEventListener("focus", () => { if (selected !== button && !button.disabled) select(enabled().indexOf(button)); });
  }
  box.addEventListener("keydown", (event) => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); dismiss();
      return;
    }
    const buttons = enabled();
    if (!buttons.length || event.target instanceof HTMLTextAreaElement) return;
    const direction = event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1
      : event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : 0;
    if (direction) {
      event.preventDefault(); event.stopPropagation();
      select((Math.max(0, buttons.indexOf(selected!)) + direction + buttons.length) % buttons.length);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault(); event.stopPropagation();
      (selected && !selected.disabled ? selected : buttons[0]).click();
    }
  });
  select(initial);
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

// The real app and mock share the command frame, cursor, plans and confirmation.
export function showHeroCommands(layer: HTMLElement, name: string, at: [number, number], on: {
  talk: () => void; status: () => void; follow: () => void; terminal?: () => void; watch?: () => void; closed: () => void;
  working: boolean; plan?: (text: string) => void; interrupt?: () => void; compact?: () => void; farewell?: () => void;
}) {
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
  const foreign = "外から来た勇者なので このアプリからは 操作できません";
  const unavailable = on.terminal ? undefined : foreign;
  const hero = { name, fighting: on.working, at };
  const interrupt = option("にげる", choose(on.interrupt ?? (() => undefined)));
  const compact = option("やすむ", () => showDraftConfirmation(layer, at,
    () => { dismiss(); on.compact?.(); }, dismiss));
  const hint = element("p", "hint");
  list.append(option("はなす", choose(on.talk)), option("ようすを みる", choose(on.status)),
    option("ついていく", choose(on.follow)),
    option("さくせん", () => showPlans(layer, hero, (text) => { dismiss(); on.plan?.(text); }, dismiss), unavailable),
    interrupt, compact,
    option("ターミナル", choose(on.terminal ?? (() => undefined)), unavailable),
    option("みおくる", () => showFarewell(layer, hero, () => { dismiss(); on.farewell?.(); }, dismiss), unavailable),
    option("とじる", dismiss));
  box.append(list, hint);
  const update = (working: boolean) => {
    hero.fighting = working;
    interrupt.disabled = Boolean(unavailable) || !working;
    compact.disabled = Boolean(unavailable) || working;
    interrupt.title = unavailable ?? (!working ? "作業中だけ つかえます" : "");
    compact.title = unavailable ?? (working ? "待機中だけ つかえます" : "");
    hint.textContent = unavailable ?? (working ? "やすむ：待機中だけ つかえます" : "にげる：作業中だけ つかえます");
    if (box.querySelector("button.selected:disabled")) list.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  };
  update(on.working);
  place(layer, box, at, dismiss);
  return Object.assign(dismiss, { update });
}

export function showCommands(layer: HTMLElement, hero: HeroState, on: Handlers): void {
  const box = element("div", "command-window");
  box.append(element("h4", undefined, hero.name));
  const list = element("div", "commands");
  const done = (text: string) => { close(layer); on.toast(text); };
  if (on.watch) list.append(option("たたかいを みる", () => { close(layer); on.watch!(); }));
  list.append(
    option("めいれい", () => showOrder(layer, hero, done)),
    option("さくせん", () => showPlans(layer, hero, (plan) => done(`${hero.name} に さくせん「${plan}」を つたえた`))),
    option("にげる", () => done(`${hero.name} は たたかいを ちゅうだんした（Esc を おくった）`), hero.fighting ? undefined : "たたかっていない ときは つかえません"),
    option("やすむ", () => done(`${hero.name} は ひとやすみ した（/compact）… MPが かいふくした！`), hero.fighting ? "たたかいの さいちゅうは つかえません" : undefined),
    option("ターミナル", () => undefined, "モックには ターミナルが ありません（本体で ひらく）"),
    option("きろく", () => { close(layer); on.report(); }, hero.hasReport ? undefined : "まだ ほうこくが ありません"),
    option("みおくる", () => showFarewell(layer, hero, () => { close(layer); on.farewell(); })),
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

function showPlans(layer: HTMLElement, hero: Pick<HeroState, "at">, done: (text: string) => void, dismiss = () => close(layer)): void {
  const box = element("div", "command-window");
  box.append(element("h4", undefined, "さくせん"));
  const list = element("div", "commands");
  for (const plan of PLANS) list.append(option(plan, () => done(plan)));
  box.append(list);
  place(layer, box, hero.at, dismiss);
}

function showFarewell(layer: HTMLElement, hero: Pick<HeroState, "name" | "fighting" | "at">,
  farewell: () => void, dismiss = () => close(layer)): void {
  const working = hero.fighting;
  showConfirmation(layer, hero.at, working ? "中断して たびだたせますか？" : `${hero.name} を みおくりますか？`,
    "セッションを おわります。再開に 対応する 勇者は めいぼから よびもどせます。", () => {
      if (!working && hero.fighting) showFarewell(layer, hero, farewell, dismiss);
      else farewell();
    }, dismiss);
}

function showConfirmation(layer: HTMLElement, at: [number, number], title: string, hint: string,
  yes: () => void, no: () => void): void {
  const box = element("div", "command-window wide");
  box.setAttribute("role", "dialog"); box.setAttribute("aria-label", title);
  box.append(element("h4", undefined, title), element("p", "hint", hint));
  const list = element("div", "commands row");
  list.append(option("はい", yes), option("いいえ", no));
  box.append(list);
  place(layer, box, at, no, 1);
}

export function showDraftConfirmation(layer: HTMLElement, at: [number, number], yes: () => void, no: () => void): void {
  showConfirmation(layer, at, "ターミナルに 書きかけの 文字が あれば 消えます", "はい を えらぶと 実行します。",
    () => { close(layer); yes(); }, () => { close(layer); no(); });
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
