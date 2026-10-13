import { element, option, place } from "./command";

// The command window of the focused battle (docs/PLATFORM.md, stage 9). Shared by the real app and the mock.
// さくせん and めいれい reach a working hero now: the CLI reads them after the current tool.
export const TACTICS: [string, string][] = [
  ["ガンガンいこうぜ", "細かい 質問は せずに、自分で 判断して どんどん すすめて"],
  ["いのちだいじに", "慎重に すすめて。消す 操作や 大きな 変更の 前には 方針を 聞いて"],
  ["じゅもんせつやく", "調べものや 出力は 必要な 分だけに して、会話を 軽く たもって"],
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
    sending = true; result = "つたえている…"; menu();
    void on.steer(text).then((line) => { result = line; }, (error: unknown) => { result = error instanceof Error ? error.message : String(error); })
      .finally(() => { sending = false; if (!closed) menu(); });
  };
  function menu(): void {
    inMenu = true;
    const box = element("div", "command-window battle-commands");
    box.setAttribute("role", "dialog"); box.setAttribute("aria-label", `${name}の たたかいの コマンド`);
    box.append(element("h4", undefined, name));
    const list = element("div", "commands");
    const busy = foreign || sending;
    list.append(option("たたかう", dismiss),
      option("さくせん", tactics, busy), option("めいれい", order, busy),
      option("にげる", () => { dismiss(); on.interrupt?.(); }, foreign || !working),
      option("もどる", () => { dismiss(); on.back(); }));
    box.append(list);
    if (result) box.append(element("p", "hint", result));
    show(box, dismiss);
  }
  function tactics(): void {
    inMenu = false;
    const box = element("div", "command-window wide battle-commands");
    box.append(element("h4", undefined, "さくせん"));
    const list = element("div", "commands");
    for (const [label, text] of TACTICS) {
      const button = option(label, () => send(`さくせん「${label}」：${text}`));
      button.title = text;
      list.append(button);
    }
    list.append(option("やめる", menu));
    box.append(list);
    show(box, menu);
  }
  function order(): void {
    inMenu = false;
    const box = element("div", "command-window wide battle-commands");
    box.append(element("h4", undefined, `${name}に めいれい`), element("p", "hint", "Ctrl+Enter で おくる"));
    const form = element("form", "answer"), input = element("textarea"), submit = element("button", undefined, "▶ つたえる");
    input.rows = 3; input.maxLength = 8000; input.placeholder = "めいれいを かく"; submit.type = "submit";
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
