import type { RoomAgent } from "../../core/room";
import { pageLength, renderTalk, talkPages, talkParts } from "./talk-text";

// One page-local conversation window. Talk itself always comes from Room/replay.
export function initTalk(hero: (id: string) => RoomAgent | undefined, name: (id: string) => string | undefined,
  openTerminal: (terminal: string) => void, arrivingHero: (terminal: string) => RoomAgent | undefined) {
  const dialog = document.querySelector<HTMLDialogElement>("#talk-dialog")!;
  const title = document.querySelector<HTMLElement>("#talk-title")!;
  const history = document.querySelector<HTMLElement>("#talk-history")!;
  const form = document.querySelector<HTMLFormElement>("#talk-form")!;
  const input = document.querySelector<HTMLTextAreaElement>("#talk-input")!;
  const send = document.querySelector<HTMLButtonElement>("#talk-send")!;
  const status = document.querySelector<HTMLElement>("#talk-status")!;
  const pendingBox = document.querySelector<HTMLElement>("#talk-pending")!;
  const foreign = document.querySelector<HTMLElement>("#talk-foreign")!;
  const terminal = document.querySelector<HTMLButtonElement>("#talk-terminal")!;
  const next = document.querySelector<HTMLButtonElement>("#talk-next")!;
  const token = new URLSearchParams(location.search).get("token") ?? "";
  const pending = new Map<string, string[]>();
  const sending = new Set<string>();
  let selected: { hero: string } | { terminal: string } | undefined;
  let signature = "";
  let latestKey = "";
  let pages = talkPages("");
  let page = 0, shown = 0, lastChar = 0;
  let latestBody: HTMLElement | undefined;

  function terminalId(): string | undefined {
    return selected && ("terminal" in selected ? selected.terminal : hero(selected.hero)?.terminal);
  }
  function heldMessage(): string {
    return selected && "terminal" in selected ? "勇者が ついたら つたえる" : "たたかいが おわったら つたえる";
  }
  function close(): void { selected = undefined; dialog.close(); }
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape") { event.preventDefault(); close(); }
    else if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !form.hidden) {
      event.preventDefault(); form.requestSubmit();
    } else if (event.key === "Enter" && event.target !== input) {
      event.preventDefault(); advancePage();
    }
  });
  document.querySelector("#talk-close")!.addEventListener("click", close);
  terminal.addEventListener("click", () => {
    const id = terminalId();
    if (id) { close(); openTerminal(id); }
  });

  function renderPage(): void {
    if (!latestBody) return;
    renderTalk(latestBody, pages[page], shown);
    const typing = shown < pageLength(pages[page]);
    next.hidden = !typing && page >= pages.length - 1;
    next.textContent = typing ? "▼ すべて みる" : `▼ つぎへ（${page + 1}/${pages.length}）`;
    next.setAttribute("aria-label", typing ? "このページの 返事を すべて みる" : "返事の つぎのページ");
  }
  function advancePage(): void {
    if (!latestBody) return;
    if (shown < pageLength(pages[page])) shown = pageLength(pages[page]);
    else if (page < pages.length - 1) { page++; shown = 0; lastChar = performance.now(); }
    renderPage();
    history.scrollTop = history.scrollHeight;
  }
  next.addEventListener("click", advancePage);
  history.addEventListener("click", () => {
    history.focus({ preventScroll: true });
    advancePage();
  });

  function renderPending(terminalId: string | undefined): void {
    const texts = terminalId ? pending.get(terminalId) ?? [] : [];
    pendingBox.hidden = !texts.length;
    pendingBox.replaceChildren();
    if (!texts.length) return;
    const heading = document.createElement("p");
    heading.textContent = heldMessage();
    pendingBox.append(heading);
    for (const text of texts) {
      const item = document.createElement("p");
      item.className = "pending-text";
      item.textContent = `あなた「${text}」`;
      pendingBox.append(item);
    }
  }
  function setPending(id: string, texts: string[]): void {
    const delivered = Boolean(pending.get(id)?.length && !texts.length);
    pending.set(id, texts);
    if (id === terminalId()) {
      renderPending(id);
      if (delivered) status.textContent = "あずかった ことばを つたえた！";
    }
  }
  function resetPending(): void {
    pending.clear();
    if (selected) renderPending(terminalId());
  }

  function update(): void {
    if (!selected || !dialog.open) return;
    if ("terminal" in selected) {
      const agent = arrivingHero(selected.terminal);
      if (agent) selected = { hero: agent.id };
      else {
        title.textContent = "勇者が 町に むかっている…";
        form.hidden = false; foreign.hidden = true; terminal.disabled = false;
        send.disabled = sending.has(selected.terminal);
        if (signature !== "arriving") {
          signature = "arriving";
          history.textContent = "町に つくまでに 依頼を つたえられます。";
        }
        renderPending(selected.terminal);
        return;
      }
    }
    const agent = hero(selected.hero);
    if (!agent) {
      form.hidden = true; foreign.hidden = true; terminal.disabled = true;
      renderPending(undefined);
      status.textContent = "この勇者は たびだちました。会話は ここまでです。";
      return;
    }
    const heroName = name(agent.id) ?? agent.name;
    title.textContent = `${heroName}と はなす`;
    form.hidden = !agent.terminal;
    foreign.hidden = Boolean(agent.terminal);
    terminal.disabled = !agent.terminal;
    send.disabled = Boolean(agent.terminal && sending.has(agent.terminal));
    const talk = agent.talk;
    const nextSignature = JSON.stringify([heroName, agent.terminal, talk]);
    if (nextSignature === signature) return;
    signature = nextSignature;
    let latest = talk.length - 1;
    while (latest >= 0 && talk[latest].from !== "hero") latest--;
    const key = latest < 0 ? "" : JSON.stringify(talk[latest]);
    const changed = key !== latestKey;
    if (changed) {
      latestKey = key; page = shown = 0; lastChar = performance.now();
      pages = talkPages(latest < 0 ? "" : talk[latest].text);
      status.textContent = "";
    }
    const atBottom = history.scrollHeight - history.scrollTop - history.clientHeight < 24;
    history.replaceChildren(); latestBody = undefined;
    if (!talk.length) history.textContent = "まだ 会話は ありません。勇者に はなしかけてみよう。";
    for (const [index, entry] of talk.entries()) {
      const row = document.createElement("div");
      row.className = `talk-line ${entry.from}`;
      const speaker = document.createElement("span");
      speaker.className = "talk-speaker";
      speaker.textContent = `${entry.from === "you" ? "あなた" : heroName}「`;
      const body = document.createElement("span");
      body.className = "talk-body";
      row.append(speaker, body, document.createTextNode("」"));
      if (index === latest) latestBody = body;
      else renderTalk(body, talkParts(entry.text));
      history.append(row);
    }
    next.hidden = latest < 0;
    renderPage();
    if (changed || atBottom) history.scrollTop = history.scrollHeight;
    renderPending(agent.terminal);
  }

  function tick(time: number): void {
    if (!dialog.open || !latestBody || shown >= pageLength(pages[page]) || time - lastChar < 24) return;
    lastChar = time;
    const atBottom = history.scrollHeight - history.scrollTop - history.clientHeight < 24;
    shown++; renderPage();
    if (atBottom) history.scrollTop = history.scrollHeight;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const id = terminalId(), text = input.value;
    if (!id || !text.trim() || text.length > 8000 || sending.has(id)) return;
    sending.add(id); send.disabled = true;
    status.textContent = "つたえている…";
    void fetch(`/api/sessions/${encodeURIComponent(id)}/say?token=${encodeURIComponent(token)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
    }).then(async (response) => {
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? `つたえられませんでした（${response.status}）`);
      }
      // Held texts are shown from the server's pending message, not added here.
      const result = await response.json() as { delivered: boolean };
      if (terminalId() !== id || !dialog.open) return;
      if (input.value === text) input.value = "";
      status.textContent = result.delivered ? "つたえた！ へんじを まっている…" : "あずかった！";
      input.focus();
    }).catch((error: unknown) => {
      if (terminalId() === id && dialog.open) status.textContent = error instanceof Error ? error.message : String(error);
    }).finally(() => {
      sending.delete(id);
      if (terminalId() === id) send.disabled = false;
    });
  });

  function openConversation(target: { hero: string } | { terminal: string }): void {
    selected = target; signature = latestKey = ""; page = shown = 0;
    input.value = ""; status.textContent = ""; history.replaceChildren();
    latestBody = undefined; next.hidden = true;
    if (!dialog.open) dialog.showModal();
    update(); renderPending(terminalId());
    if (terminalId()) input.focus();
    else document.querySelector<HTMLButtonElement>("#talk-close")!.focus();
  }
  return { open: (id: string) => openConversation({ hero: id }),
    openSession: (id: string) => openConversation({ terminal: id }), update, tick, setPending, resetPending };
}
