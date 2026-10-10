import type { Session } from "../terminal";

// Only the launched/recalled terminal being awaited by the conversation window.
export function initArrival(title: HTMLElement, history: HTMLElement, form: HTMLFormElement, terminal: HTMLButtonElement) {
  const token = new URLSearchParams(location.search).get("token") ?? "";
  let waiting: { id: string; since: number; checked: number; checking: boolean; ended?: string } | undefined;
  const guidance = "ターミナルで かくにんが でている かもしれません（はじめての フォルダでは Claude が フォルダを しんらいするか きいてきます）";

  function watch(id?: string): void {
    waiting = id ? { id, since: Date.now(), checked: -Infinity, checking: false } : undefined;
    terminal.classList.remove("terminal-attention");
  }
  function update(): void {
    const current = waiting;
    if (!current) return;
    const delayed = Date.now() - current.since >= 5000;
    title.textContent = current.ended ?? "勇者が 町に むかっている…";
    form.hidden = current.ended !== undefined;
    terminal.disabled = false;
    terminal.classList.toggle("terminal-attention", delayed || current.ended !== undefined);
    const text = current.ended ? "ターミナルで のこった 出力を たしかめられます。"
      : delayed ? guidance : "町に つくまでに 依頼を つたえられます。";
    if (history.textContent !== text) {
      const message = document.createElement("p");
      message.className = delayed || current.ended ? "arrival-guidance" : "";
      message.textContent = text; history.replaceChildren(message);
    }
    if (current.ended || current.checking || Date.now() - current.checked < 1000) return;
    current.checked = Date.now(); current.checking = true;
    void fetch(`/api/sessions?token=${encodeURIComponent(token)}`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const sessions = await response.json() as Session[];
      if (waiting !== current) return;
      const session = sessions.find((item) => item.id === current.id);
      if (!session || session.exited) {
        current.ended = `勇者は こられなかった（おわった: コード ${session?.exited?.code ?? "不明"}）`;
        update();
      }
    }).catch(() => { /* A transient API error is not proof that the hero ended. */ })
      .finally(() => { current.checking = false; });
  }
  return { watch, update };
}
