import type { Sheets } from "../town/sheets";
import type { RoomAgent } from "../../core/room";
import { renderTalk, talkParts } from "./talk-text";
import { createReportCard } from "./report-card";
import { markReportRead, reportRead } from "./read-reports";
import { initArrival } from "./arrival";

// The talk and terminal windows cover the map in the same place, so switching between them keeps the layout.
export function coverMap(dialog: HTMLElement): void {
  const rect = document.querySelector(".map-stage")!.getBoundingClientRect();
  dialog.style.left = `${Math.max(8, rect.left)}px`;
  dialog.style.top = `${Math.max(8, Math.min(rect.top, innerHeight - 320))}px`;
  dialog.style.width = `${Math.min(rect.width, innerWidth - 16)}px`;
  dialog.style.height = `${Math.min(Math.max(rect.height, 520), innerHeight - Math.max(8, rect.top) - 8)}px`;
}

// One page-local conversation window. Talk itself always comes from Room/replay.
export function initTalk(hero: (id: string) => RoomAgent | undefined, name: (id: string) => string | undefined,
  openTerminal: (terminal: string) => void, arrivingHero: (terminal: string) => RoomAgent | undefined, art: Sheets) {
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
  const recallHint = document.querySelector<HTMLElement>("#talk-recall")!;
  const drafts = new Map<string, string>(), recalled = new Set<string>();
  const arrival = initArrival(title, history, form, terminal);
  const token = new URLSearchParams(location.search).get("token") ?? "";
  const pending = new Map<string, string[]>(), sending = new Set<string>(), interrupting = new Set<string>();
  const expanded = new Set<number>();
  let selected: { hero: string } | { terminal: string } | undefined;
  let signature = "", texts: string[] = [];
  let latestAt: number | undefined, latestText: string | undefined;
  let shown = 0, length = 0, lastChar = 0;
  let latest: ReturnType<typeof createReportCard> | undefined;
  let scrollTo: number | undefined;

  function terminalId(): string | undefined {
    return selected && ("terminal" in selected ? selected.terminal : hero(selected.hero)?.terminal);
  }
  function heldMessage(): string {
    return selected && "terminal" in selected ? "勇者が ついたら つたえる" : "たたかいが おわったら つたえる";
  }
  function draftKey(): string | undefined { return selected && ("hero" in selected ? `hero:${selected.hero}` : `terminal:${selected.terminal}`); }
  function saveDraft(): void { const key = draftKey(); if (key) drafts.set(key, input.value); }
  input.addEventListener("input", saveDraft);
  function close(): void { saveDraft(); arrival.watch(); selected = undefined; dialog.close(); }
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape") { event.preventDefault(); close(); }
    else if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !form.hidden) {
      event.preventDefault(); form.requestSubmit();
    } else if (event.key === "Enter" && event.target !== input && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault(); skipTyping();
    }
  });
  dialog.addEventListener("click", (event) => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) close();
  });
  document.querySelector("#talk-close")!.addEventListener("click", close);
  terminal.addEventListener("click", () => {
    const id = terminalId();
    if (id) { close(); openTerminal(id); }
  });

  const position = () => coverMap(dialog);
  window.addEventListener("resize", () => { if (dialog.open) { position(); markVisible(); } });
  function renderLatest(): void {
    if (!latest) return;
    latest.show(shown);
    next.hidden = shown >= length;
  }
  function skipTyping(): void {
    shown = length; renderLatest(); markVisible();
  }
  next.addEventListener("click", skipTyping);
  history.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("button")) return;
    history.focus({ preventScroll: true }); skipTyping();
  });
  function markVisible(): void {
    if (!dialog.open || !selected || !("hero" in selected)) return;
    const bounds = history.getBoundingClientRect();
    for (const row of history.querySelectorAll<HTMLElement>("[data-report-at]")) {
      const rect = row.getBoundingClientRect();
      // A visible heading is enough: collapsed long reports can be read later.
      if (rect.top < bounds.bottom && rect.top + Math.min(rect.height, 64) > bounds.top) {
        markReportRead(selected.hero, Number(row.dataset.reportAt));
        row.classList.remove("unread");
      }
    }
  }
  history.addEventListener("scroll", markVisible);

  function renderPending(id: string | undefined): void {
    const texts = id ? pending.get(id) ?? [] : [];
    pendingBox.hidden = !texts.length; pendingBox.replaceChildren();
    if (!texts.length) return;
    const heading = document.createElement("p"); heading.textContent = heldMessage(); pendingBox.append(heading);
    for (const text of texts) {
      const item = document.createElement("p"); item.className = "pending-text";
      item.textContent = `あなた「${text}」`; pendingBox.append(item);
    }
  }
  function setPending(id: string, texts: string[]): void {
    const delivered = Boolean(pending.get(id)?.length && !texts.length);
    pending.set(id, texts);
    if (id === terminalId()) {
      renderPending(id);
      if (delivered && !interrupting.has(id)) status.textContent = "あずかった ことばを つたえた！";
    }
  }
  function resetPending(): void { pending.clear(); if (selected) renderPending(terminalId()); }

  function update(): void {
    if (!selected || !dialog.open) return;
    recallHint.hidden = !recalled.has(terminalId() ?? "");
    if ("terminal" in selected) {
      const agent = arrivingHero(selected.terminal);
      if (agent) {
        const key = draftKey()!, draft = drafts.get(key); drafts.delete(key);
        selected = { hero: agent.id };
        input.value = draft ?? drafts.get(draftKey()!) ?? input.value;
        drafts.set(draftKey()!, input.value); arrival.watch();
      }
      else {
        foreign.hidden = true; send.disabled = sending.has(selected.terminal);
        arrival.update(); renderPending(selected.terminal); return;
      }
    }
    const agent = hero(selected.hero);
    if (!agent) {
      form.hidden = true; foreign.hidden = true; terminal.disabled = true;
      renderPending(undefined); status.textContent = "この勇者は たびだちました。会話は ここまでです。"; return;
    }
    const heroName = name(agent.id) ?? agent.name;
    title.textContent = `${heroName} · 会話と報告`;
    form.hidden = !agent.terminal; foreign.hidden = Boolean(agent.terminal); terminal.disabled = !agent.terminal;
    send.disabled = Boolean(agent.terminal && sending.has(agent.terminal));
    const talk = agent.talk;
    const nextSignature = JSON.stringify([heroName, agent.terminal, talk.map(({ at, from, report }) => [at, from, report])]);
    if (nextSignature === signature && talk.every((entry, i) => entry.text === texts[i])) return;
    signature = nextSignature; texts = talk.map((entry) => entry.text);
    const reply = [...talk].reverse().find((entry) => entry.from === "hero");
    const changed = reply?.at !== latestAt || reply?.text !== latestText;
    if (changed) {
      latestAt = reply?.at; latestText = reply?.text;
      shown = reply && reportRead(agent.id, reply.at) ? Infinity : 0;
      lastChar = performance.now(); status.textContent = "";
    }
    const atBottom = history.scrollHeight - history.scrollTop - history.clientHeight < 24;
    const scroll = history.scrollTop;
    history.replaceChildren(); latest = undefined;
    if (!talk.length) history.textContent = "まだ 会話は ありません。勇者に はなしかけてみよう。";
    for (const entry of talk) {
      if (entry.from === "you") {
        const row = document.createElement("div"); row.className = "talk-line you";
        const speaker = document.createElement("span"); speaker.className = "talk-speaker"; speaker.textContent = "あなた「";
        const body = document.createElement("span"); body.className = "talk-body"; renderTalk(body, talkParts(entry.text));
        row.append(speaker, body, document.createTextNode("」")); history.append(row); continue;
      }
      const card = createReportCard(entry, heroName, art);
      card.row.classList.toggle("unread", !reportRead(agent.id, entry.at));
      const bodyLength = card.renderBody(expanded.has(entry.at), entry === reply ? shown : Infinity);
      if (entry === reply) { latest = card; length = bodyLength; }
      card.more.addEventListener("click", () => {
        if (expanded.has(entry.at)) expanded.delete(entry.at); else expanded.add(entry.at);
        const bodyLength = card.renderBody(expanded.has(entry.at), entry === reply ? shown : Infinity);
        if (entry === reply) { length = bodyLength; renderLatest(); }
        markVisible();
      });
      history.append(card.row);
    }
    next.hidden = !latest; renderLatest();
    if (scrollTo !== undefined) {
      const target = [...history.querySelectorAll<HTMLElement>("[data-report-at]")].find((row) => Number(row.dataset.reportAt) === scrollTo);
      if (target) history.scrollTop += target.getBoundingClientRect().top - history.getBoundingClientRect().top;
      scrollTo = undefined;
    } else if (changed && latest) history.scrollTop += latest.row.getBoundingClientRect().top - history.getBoundingClientRect().top;
    else history.scrollTop = atBottom ? history.scrollHeight : scroll;
    renderPending(agent.terminal); markVisible();
  }

  function tick(time: number): void {
    if (!dialog.open) return;
    if (!latest || shown >= length || time - lastChar < 24) return;
    lastChar = time;
    const atBottom = history.scrollHeight - history.scrollTop - history.clientHeight < 24;
    shown++; renderLatest();
    if (atBottom) history.scrollTop = history.scrollHeight;
  }

  async function sendText(text: string): Promise<void> {
    const id = terminalId();
    if (!id || !text.trim() || text.length > 8000 || sending.has(id)) return;
    const key = draftKey();
    sending.add(id); send.disabled = true;
    status.textContent = "つたえている…";
    await fetch(`/api/sessions/${encodeURIComponent(id)}/say?token=${encodeURIComponent(token)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
    }).then(async (response) => {
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? `つたえられませんでした（${response.status}）`);
      }
      const result = await response.json() as { delivered: boolean };
      if (key && drafts.get(key) === text) drafts.delete(key);
      if (terminalId() !== id || !dialog.open) return;
      if (input.value === text) { input.value = ""; saveDraft(); }
      status.textContent = result.delivered ? "つたえた！ へんじを まっている…" : "あずかった！"; input.focus();
    }).catch((error: unknown) => {
      if (terminalId() === id && dialog.open) status.textContent = error instanceof Error ? error.message : String(error);
    }).finally(() => { sending.delete(id); if (terminalId() === id) send.disabled = false; });
  }
  form.addEventListener("submit", (event) => { event.preventDefault(); void sendText(input.value); });

  function openConversation(target: { hero: string } | { terminal: string }, at?: number): void {
    saveDraft(); arrival.watch("terminal" in target ? target.terminal : undefined);
    selected = target; signature = ""; texts = []; latestAt = latestText = undefined; shown = 0; expanded.clear(); scrollTo = at;
    const key = draftKey()!, awaited = "hero" in target ? hero(target.hero)?.terminal : undefined;
    const waitingKey = awaited ? `terminal:${awaited}` : undefined;
    input.value = drafts.get(key) ?? (waitingKey ? drafts.get(waitingKey) : undefined) ?? "";
    if (waitingKey) { drafts.delete(waitingKey); drafts.set(key, input.value); }
    status.textContent = ""; history.replaceChildren(); latest = undefined; next.hidden = true;
    position(); if (!dialog.open) dialog.showModal();
    update(); renderPending(terminalId());
    if (terminalId() && at === undefined) input.focus(); else history.focus({ preventScroll: true });
  }
  return { open: (id: string, at?: number) => openConversation({ hero: id }, at),
    openSession: (id: string, recall = false) => { if (recall) recalled.add(id); openConversation({ terminal: id }); },
    attention: (id: string) => { arrival.attention(id, true); update(); },
    clearAttention: (id: string) => arrival.attention(id, false),
    update, tick, setPending, resetPending, sendText, close,
    notice: (text: string) => { status.textContent = text; },
    interrupting: (id: string, active: boolean) => { if (active) interrupting.add(id); else interrupting.delete(id); } };
}
