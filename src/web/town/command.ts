import { tr } from "../language";
import type { Departed } from "./walkers";

// The command window that opens next to a hero you click (docs/PLATFORM.md); the mock uses the same window.
interface HeroState { name: string; fighting: boolean; at: [number, number] } // at: CSS px in the stage

const PLANS = [tr("テストを とおして", "Run the tests"), tr("コミットして", "Commit the changes"), tr("ほうしんを みなおして", "Rethink the plan")];

export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function place(layer: HTMLElement, box: HTMLElement, at: [number, number], dismiss = () => close(layer), initial = 0): void {
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

export function option(label: string, action: () => void, disabled = false): HTMLButtonElement {
  const button = element("button", undefined, label);
  button.type = "button";
  if (disabled) {
    button.disabled = true;
  }
  button.addEventListener("click", action);
  return button;
}

// The real app and mock share the command frame, cursor, plans and confirmation.
export function showHeroCommands(layer: HTMLElement, name: string, at: [number, number], on: {
  talk: () => void; status: () => void; follow: () => void; terminal?: () => void; watch?: () => void; closed: () => void;
  working: boolean; plan?: (text: string) => void; interrupt?: () => void; compact?: () => void; farewell?: () => void;
  equip?: (layer: HTMLElement, at: [number, number], dismiss: () => void) => void; review?: () => void;
}) {
  const box = element("div", "command-window");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", tr(`${name}の コマンド`, `Commands for ${name}`));
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
  if (on.watch) list.append(option(tr("たたかいを みる", "Watch battle"), choose(on.watch)));
  const unavailable = !on.terminal;
  const hero = { name, fighting: on.working, at };
  const interrupt = option(tr("にげる", "Flee"), choose(on.interrupt ?? (() => undefined)));
  const compact = option(tr("やすむ", "Rest"), () => showRestConfirmation(layer, at, name,
    () => { dismiss(); on.compact?.(); }, dismiss));
  list.append(option(tr("はなす", "Talk"), choose(on.talk)), option(tr("ようすを みる", "Status"), choose(on.status)),
    option(tr("ついていく", "Follow"), choose(on.follow)),
    option(tr("かんてい", "Review"), choose(on.review ?? (() => undefined)), !on.review),
    option(tr("そうび", "Equip"), () => on.equip?.(layer, at, dismiss), unavailable),
    option(tr("さくせん", "Tactics"), () => showPlans(layer, hero, (text) => { dismiss(); on.plan?.(text); }, dismiss), unavailable),
    interrupt, compact,
    option(tr("ターミナル", "Terminal"), choose(on.terminal ?? (() => undefined)), unavailable),
    option(tr("みおくる", "See off"), () => showFarewell(layer, hero, () => { dismiss(); on.farewell?.(); }, dismiss), unavailable),
    option(tr("とじる", "Close"), dismiss));
  box.append(list);
  const update = (working: boolean) => {
    hero.fighting = working;
    interrupt.disabled = Boolean(unavailable) || !working;
    compact.disabled = Boolean(unavailable) || working;
    if (box.querySelector("button.selected:disabled")) list.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  };
  update(on.working);
  place(layer, box, at, dismiss);
  return Object.assign(dismiss, { update });
}

function showPlans(layer: HTMLElement, hero: Pick<HeroState, "at">, done: (text: string) => void, dismiss = () => close(layer)): void {
  const box = element("div", "command-window");
  box.append(element("h4", undefined, tr("さくせん", "Tactics")));
  const list = element("div", "commands");
  for (const plan of PLANS) list.append(option(plan, () => done(plan)));
  box.append(list);
  place(layer, box, hero.at, dismiss);
}

function showFarewell(layer: HTMLElement, hero: Pick<HeroState, "name" | "fighting" | "at">,
  farewell: () => void, dismiss = () => close(layer)): void {
  const working = hero.fighting;
  showConfirmation(layer, hero.at, working ? tr("中断して たびだたせますか？", "Interrupt and see this hero off?") : tr(`${hero.name} を みおくりますか？`, `See ${hero.name} off?`),
    "", () => {
      if (!working && hero.fighting) showFarewell(layer, hero, farewell, dismiss);
      else farewell();
    }, dismiss);
}

function showConfirmation(layer: HTMLElement, at: [number, number], title: string, hint: string,
  yes: () => void, no: () => void): void {
  const box = element("div", "command-window wide");
  box.setAttribute("role", "dialog"); box.setAttribute("aria-label", title);
  box.append(element("h4", undefined, title));
  if (hint) box.append(element("p", "hint", hint));
  const list = element("div", "commands row");
  list.append(option(tr("はい", "Yes"), yes), option(tr("いいえ", "No"), no));
  box.append(list);
  place(layer, box, at, no, 1);
}

function showRestConfirmation(layer: HTMLElement, at: [number, number], name: string, yes: () => void, no: () => void): void {
  showConfirmation(layer, at, tr(`${name}の おはなしを まとめて やすませますか？`, `Let ${name} rest and lighten the conversation?`),
    tr("ターミナルの 書きかけの ことばは 消えます。", "Unsent terminal text will be cleared."),
    () => { close(layer); yes(); }, () => { close(layer); no(); });
}

// The roster of heroes who have set off; call one back to resume the same session.
export function showRoster(layer: HTMLElement, roster: Departed[], onRecall: (name: string) => void): void {
  layer.classList.remove("menu-layer");
  const box = element("div", "report-window");
  box.setAttribute("role", "dialog");
  box.append(element("h3", undefined, tr(`ぼうけんしゃの めいぼ（${roster.length}）`, `Adventurers' roster (${roster.length})`)));
  if (!roster.length) box.append(element("p", "who", tr("まだ だれも たびだって いません。", "No one has set off yet.")));
  for (const d of roster) {
    const row = element("div", "roster-row");
    const text = element("div");
    text.append(element("p", "name", tr(`${d.name}（${d.repo}）　${d.left} に たびだった`, `${d.name} (${d.repo}) · Left ${d.left}`)), element("p", "last", d.last));
    const recall = option(tr("▶ よびもどす", "▶ Recall"), () => { layer.hidden = true; onRecall(d.name); });
    row.append(text, recall);
    box.append(row);
  }
  const actions = element("div", "actions");
  actions.append(option(tr("▶ とじる", "▶ Close"), () => { layer.hidden = true; }));
  box.append(actions);
  layer.replaceChildren(box);
  layer.hidden = false;
}
