import { sessionRequest, type Session } from "../terminal";

// Managing a terminal is separate from launching a hero. No session ends on window close.
export function initTerminals(name: (id: string) => string | undefined, open: (id: string) => void): void {
  const dialog = document.querySelector<HTMLDialogElement>("#terminals-dialog")!;
  const list = document.querySelector<HTMLElement>("#terminals-list")!;
  const status = document.querySelector<HTMLElement>("#terminals-status")!;
  let request = 0, deleting = false;
  const close = () => { request++; dialog.close(); };
  const label = (session: Session) => `${name(session.id) ?? session.project} / ${session.preset} / ${session.id}`;
  function render(sessions: Session[]): void {
    list.replaceChildren();
    for (const ended of [false, true]) {
      const heading = document.createElement("h4"); heading.textContent = ended ? "終わった ターミナル" : "動いている ターミナル";
      list.append(heading);
      const items = sessions.filter((session) => Boolean(session.exited) === ended);
      if (!items.length) { const empty = document.createElement("p"); empty.textContent = "ありません。"; list.append(empty); }
      for (const session of items) {
        const row = document.createElement("div"); row.className = "session-row town-row";
        const text = document.createElement("div"); text.textContent = label(session);
        const path = document.createElement("p"); path.className = "hint"; path.textContent = session.cwd;
        text.append(path);
        const actions = document.createElement("div"); actions.className = "actions";
        const show = document.createElement("button"); show.type = "button"; show.textContent = "▶ 開く";
        show.addEventListener("click", () => { close(); open(session.id); });
        const remove = document.createElement("button"); remove.type = "button";
        remove.textContent = ended ? "▶ 消す" : "▶ 終わらせて 消す";
        remove.addEventListener("click", () => confirmRemoval(session, row));
        actions.append(show, remove); row.append(text, actions); list.append(row);
      }
    }
  }
  function confirmRemoval(session: Session, row: HTMLElement): void {
    if (deleting) return;
    // Replacing the row makes the safe initial choice and the exact target visible.
    const question = document.createElement("p"); question.textContent = `「${label(session)}」を ${session.exited ? "消しますか？" : "終わらせて 消しますか？ 作業は 中断されます。"}`;
    const no = document.createElement("button"); no.type = "button"; no.textContent = "▶ いいえ";
    no.addEventListener("click", () => void refresh());
    const yes = document.createElement("button"); yes.type = "button"; yes.textContent = "はい";
    yes.addEventListener("click", () => {
      if (deleting) return;
      deleting = true; no.disabled = yes.disabled = true;
      status.textContent = "終わらせて 消している…";
      void sessionRequest("DELETE", `/${encodeURIComponent(session.id)}`).then(async () => {
        if (!dialog.open) return;
        await refresh(); status.textContent = "ターミナルを 消しました。";
      }).catch((error: Error) => { if (dialog.open) { status.textContent = error.message; no.disabled = yes.disabled = false; } })
        .finally(() => { deleting = false; });
    });
    row.replaceChildren(question, no, yes); no.focus();
  }
  async function refresh(): Promise<void> {
    const current = ++request; status.textContent = "よみこみ中…";
    try {
      const sessions = await sessionRequest() as Session[];
      if (request !== current || !dialog.open) return;
      render(sessions); status.textContent = "";
    } catch (error) {
      if (request === current && dialog.open) status.textContent = error instanceof Error ? error.message : String(error);
    }
  }
  document.querySelector("#terminals")!.addEventListener("click", () => { dialog.showModal(); void refresh(); });
  document.querySelector("#terminals-refresh")!.addEventListener("click", () => { if (!deleting) void refresh(); });
  document.querySelector("#terminals-close")!.addEventListener("click", close);
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  dialog.addEventListener("keydown", (event) => event.stopPropagation());
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  });
}
