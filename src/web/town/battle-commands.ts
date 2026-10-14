import { tr } from "../language";
import { element, option, place } from "./command";

// The command window of the focused battle (docs/PLATFORM.md, stage 9). Shared by the real app and the mock.
// さくせん and めいれい reach a working hero now: the CLI reads them after the current tool.
export const TACTICS: [string, string][] = [
  [tr("ガンガンいこうぜ", "Go all out"), tr("細かい 質問は せずに、自分で 判断して どんどん すすめて", "Make your own decisions and keep moving without asking small questions.")],
  [tr("いのちだいじに", "Play it safe"), tr("慎重に すすめて。消す 操作や 大きな 変更の 前には 方針を 聞いて", "Proceed carefully. Ask before deleting anything or making major changes.")],
  [tr("じゅもんせつやく", "Save MP"), tr("調べものや 出力は 必要な 分だけに して、会話を 軽く たもって", "Keep research and output to what is needed, and keep the conversation light.")],
];

type BattleHandlers = {
  working: boolean;
  steer?: (text: string) => Promise<string>; // The result line to show. Missing for heroes from outside the app.
  interrupt?: () => void; back: () => void; closed: () => void;
};

// `corner` is the window's bottom-right corner (stage px): right of the battle, above its message window.
export function showBattleCommands(layer: HTMLElement, name: string, corner: [number, number], on: BattleHandlers) {
  const show = (box: HTMLElement, back: () => void) => {
    place(layer, box, corner, back);
    box.style.left = `${Math.max(8, corner[0] - box.offsetWidth)}px`;
    box.style.top = `${Math.max(8, corner[1] - box.offsetHeight)}px`;
  };
  const foreign = !on.steer;
  let closed = false, working = on.working, sending = false, inMenu = false, result = "";
  const dismiss = () => {
    if (closed) return;
    closed = true; layer.hidden = true; layer.classList.remove("menu-layer");
    on.closed();
  };
  const send = (text: string) => {
    if (!on.steer || sending) return;
    sending = true; result = tr("つたえている…", "Sending…"); menu();
    void on.steer(text).then((line) => { result = line; }, (error: unknown) => { result = error instanceof Error ? error.message : String(error); })
      .finally(() => { sending = false; if (!closed) menu(); });
  };
  function menu(): void {
    inMenu = true;
    const box = element("div", "command-window battle-commands");
    box.setAttribute("role", "dialog"); box.setAttribute("aria-label", tr(`${name}の たたかいの コマンド`, `Battle commands for ${name}`));
    box.append(element("h4", undefined, name));
    const list = element("div", "commands");
    const busy = foreign || sending;
    list.append(option(tr("たたかう", "Fight"), dismiss),
      option(tr("さくせん", "Tactics"), tactics, busy), option(tr("めいれい", "Order"), order, busy),
      option(tr("にげる", "Flee"), () => { dismiss(); on.interrupt?.(); }, foreign || !working),
      option(tr("もどる", "Back"), () => { dismiss(); on.back(); }));
    box.append(list);
    if (result) box.append(element("p", "hint", result));
    show(box, dismiss);
  }
  function tactics(): void {
    inMenu = false;
    const box = element("div", "command-window wide battle-commands");
    box.append(element("h4", undefined, tr("さくせん", "Tactics")));
    const list = element("div", "commands");
    for (const [label, text] of TACTICS) {
      const button = option(label, () => send(tr(`さくせん「${label}」：${text}`, `Tactics "${label}": ${text}`)));
      button.title = text;
      list.append(button);
    }
    list.append(option(tr("やめる", "Cancel"), menu));
    box.append(list);
    show(box, menu);
  }
  function order(): void {
    inMenu = false;
    const box = element("div", "command-window wide battle-commands");
    box.append(element("h4", undefined, tr(`${name}に めいれい`, `Order for ${name}`)), element("p", "hint", tr("Ctrl+Enter で おくる", "Ctrl+Enter to send")));
    const form = element("form", "answer"), input = element("textarea"), submit = element("button", undefined, tr("▶ つたえる", "▶ Send"));
    input.rows = 3; input.maxLength = 8000; input.placeholder = tr("めいれいを かく", "Write an order"); submit.type = "submit";
    form.append(input, submit);
    form.addEventListener("submit", (event) => { event.preventDefault(); if (input.value.trim()) send(input.value.trim()); });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.isComposing) { event.preventDefault(); form.requestSubmit(); }
    });
    box.append(form);
    show(box, menu);
    input.focus();
  }
  menu();
  return Object.assign(dismiss, { update: (next: boolean) => { if (next !== working) { working = next; if (!closed && inMenu) menu(); } } });
}
