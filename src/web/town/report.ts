import { tr } from "../language";
export type Report = { title: string; who: string; rows: [string, string][]; reply: string };

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const threads = new Map<string, string[]>();

export function showReport(root: HTMLElement, name: string, report: Report, onClose: () => void): void {
  const box = element("div", "report-window");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", report.title);
  box.append(element("h3", undefined, report.title), element("p", "who", report.who));
  const table = element("dl");
  for (const [key, value] of report.rows) table.append(element("dt", undefined, key), element("dd", undefined, value));
  box.append(table, element("h4", undefined, tr("さいごの へんじ", "Last reply")), element("p", "reply", report.reply));
  const sent = element("div", "thread");
  const renderThread = () => sent.replaceChildren(...(threads.get(name) ?? []).map((text) => element("p", "mine", tr(`あなた：${text}`, `You: ${text}`))));
  renderThread();
  box.append(sent);
  if (report.title === tr("へんじ", "Reply")) {
    const form = element("form", "answer");
    const input = element("textarea");
    input.rows = 3;
    input.placeholder = tr(`${name} に へんじを かく（Ctrl+Enter で おくる）`, `Reply to ${name} (Ctrl+Enter to send)`);
    const send = element("button", undefined, tr("▶ おくる", "▶ Send"));
    send.type = "submit";
    form.append(input, send);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      threads.set(name, [...(threads.get(name) ?? []), text]);
      input.value = "";
      renderThread();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) form.requestSubmit();
    });
    box.append(form);
    setTimeout(() => input.focus(), 0);
  }
  const actions = element("div", "actions");
  const close = element("button", undefined, tr("▶ とじる", "▶ Close"));
  close.type = "button";
  close.addEventListener("click", () => { root.hidden = true; onClose(); });
  const terminal = element("button", undefined, tr("▶ ターミナルで ひらく", "▶ Open terminal"));
  terminal.type = "button";
  terminal.disabled = true;
  actions.append(close, terminal);
  box.append(actions);
  root.classList.remove("menu-layer");
  root.replaceChildren(box);
  root.hidden = false;
}
