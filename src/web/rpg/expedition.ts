import { connectSessionTerminal, sessionRequest, type Session } from "../terminal";
import { loadTowns, type TownRecord } from "./ledger";
import { coverMap } from "./talk";

// Page-local windows. All session ownership stays on the server.
export function initExpedition(currentTown: () => string | undefined, heroName: (terminal: string) => string | undefined,
  launched: (session: Session, towns: TownRecord[]) => void, talkHero: (terminal: string) => string | undefined,
  openTalk: (id: string) => void) {
  const launch = document.querySelector<HTMLDialogElement>("#expedition-dialog")!;
  const dialog = document.querySelector<HTMLDialogElement>("#session-dialog")!;
  const title = document.querySelector<HTMLElement>("#session-title")!;
  const talk = document.querySelector<HTMLButtonElement>("#session-talk")!;
  const terminalStatus = document.querySelector<HTMLElement>("#session-status")!;
  const container = document.querySelector<HTMLElement>("#session-terminal")!;
  const form = document.querySelector<HTMLFormElement>("#expedition-form")!;
  const preset = document.querySelector<HTMLSelectElement>("#expedition-preset")!;
  const destination = document.querySelector<HTMLSelectElement>("#expedition-destination")!;
  const path = document.querySelector<HTMLInputElement>("#expedition-path")!;
  const pathLabel = document.querySelector<HTMLElement>("#expedition-path-label")!;
  const start = document.querySelector<HTMLButtonElement>("#expedition-start")!;
  const status = document.querySelector<HTMLElement>("#expedition-status")!;
  const list = document.querySelector<HTMLElement>("#expedition-sessions")!;
  let dispose: (() => void) | undefined;
  let attached: Session | undefined;
  let opening = 0;
  let launching = 0;

  function closeTerminal(): void {
    opening++;
    dispose?.(); dispose = undefined; attached = undefined;
    dialog.close();
  }
  function closeLaunch(): void { launching++; launch.close(); }
  for (const [window, close] of [[launch, closeLaunch], [dialog, closeTerminal]] as const) {
    window.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
    window.addEventListener("click", (event) => {
      if (event.target !== window) return;
      const bounds = window.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
    });
    // xterm handles its keys first, but town shortcuts must never see them.
    window.addEventListener("keydown", (event) => event.stopPropagation());
  }
  // Escape belongs to this window, not to the CLI (no interrupt command in this stage).
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.isComposing) return;
    event.preventDefault(); event.stopPropagation(); closeTerminal();
  }, true);
  document.querySelector("#session-close")!.addEventListener("click", closeTerminal);
  talk.addEventListener("click", () => {
    const id = attached?.preset === "claude" && !attached.exited ? talkHero(attached.id) : undefined;
    if (id) { closeTerminal(); openTalk(id); }
  });
  document.querySelector("#expedition-close")!.addEventListener("click", closeLaunch);

  function updateTitle(): void {
    talk.hidden = !attached || attached.preset !== "claude" || Boolean(attached.exited) || !talkHero(attached.id);
    if (!attached) return;
    const name = heroName(attached.id) ?? `${attached.project} / ${attached.preset}`;
    const text = `${name} — ターミナル`;
    if (title.textContent !== text) title.textContent = text;
  }
  function attach(session: Session): void {
    attached = session;
    updateTitle();
    dispose = connectSessionTerminal(container, session, terminalStatus, () => {
      void sessionRequest().then((result) => {
        if (attached !== session) return;
        const latest = (result as Session[]).find((item) => item.id === session.id);
        if (latest?.exited) terminalStatus.textContent = `おわった (${latest.exited.code})・会話は のこっています`;
        else if (!latest) terminalStatus.textContent = "この ターミナルは なくなりました。";
      }).catch((error: Error) => { if (attached === session) terminalStatus.textContent = error.message; });
    }).dispose;
  }
  function prepareTerminal(): number {
    closeLaunch(); closeTerminal();
    title.textContent = "ターミナル"; talk.hidden = true;
    terminalStatus.textContent = "よみこみ中…";
    container.replaceChildren();
    coverMap(dialog);
    dialog.showModal();
    return opening;
  }
  async function openTerminal(id: string): Promise<void> {
    const request = prepareTerminal();
    try {
      const sessions = await sessionRequest() as Session[];
      if (opening !== request || !dialog.open) return;
      const session = sessions.find((item) => item.id === id);
      if (!session) throw new Error("この ターミナルは なくなりました。一覧を おたしかめください。");
      attach(session);
    } catch (error) {
      if (opening === request && dialog.open) terminalStatus.textContent = error instanceof Error ? error.message : String(error);
    }
  }
  function chooseDestination(): void {
    const other = !destination.value;
    path.hidden = pathLabel.hidden = !other;
    path.disabled = !other;
    path.required = other;
  }
  destination.addEventListener("change", chooseDestination);
  document.querySelector("#expedition")!.addEventListener("click", () => {
    const request = ++launching;
    preset.value = "claude";
    destination.replaceChildren(new Option("ほかの フォルダ", ""));
    destination.disabled = start.disabled = true;
    path.value = "";
    chooseDestination();
    status.textContent = "よみこみ中…";
    list.replaceChildren();
    launch.showModal();
    const selectedTown = currentTown();
    void Promise.allSettled([loadTowns(), sessionRequest()]).then(([towns, sessions]) => {
      if (launching !== request || !launch.open) return;
      const errors: string[] = [];
      if (towns.status === "fulfilled") {
        for (const town of towns.value.filter((item) => item.archivedAt === undefined)) {
          const option = new Option(`${town.name} — ${town.path}`, town.path);
          destination.add(option, destination.options.length - 1);
          if (town.name === selectedTown) destination.value = town.path;
        }
        if (!selectedTown && destination.options.length > 1) destination.selectedIndex = 0;
      } else errors.push("町の台帳を よみこめませんでした。ほかの フォルダを 指定できます。");
      chooseDestination();
      destination.disabled = start.disabled = false;
      if (sessions.status === "fulfilled") {
        const items = sessions.value as Session[];
        if (!items.length) list.textContent = "まだ ターミナルは ありません。";
        for (const session of items) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "town-row session-row";
          button.textContent = `${heroName(session.id) ?? session.project} / ${session.preset} / ${session.id}${session.exited ? " — おわった" : ""}`;
          button.title = session.cwd;
          button.addEventListener("click", () => void openTerminal(session.id));
          list.append(button);
        }
      } else errors.push(sessions.reason instanceof Error ? sessions.reason.message : "ターミナル一覧を よみこめませんでした。");
      status.textContent = errors.join("\n");
    });
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (start.disabled) return;
    const request = launching;
    const cwd = destination.value || path.value.trim();
    start.disabled = true;
    status.textContent = "しゅつじん中…";
    void sessionRequest("POST", "", { preset: preset.value, cwd }).then(async (result) => {
      if (launching !== request || !launch.open) return; // Closing never cancels or deletes a created session.
      const session = result as Session;
      // Shell has no arriving hero or conversation; keep its existing terminal entry.
      if (session.preset === "shell") { prepareTerminal(); attach(session); return; }
      const towns = await loadTowns();
      if (launching !== request || !launch.open) return;
      closeLaunch();
      launched(session, towns);
    }).catch((error: Error) => {
      if (launching === request && launch.open) status.textContent = error.message;
    }).finally(() => { if (launching === request) start.disabled = false; });
  });
  window.addEventListener("resize", () => { if (dialog.open) coverMap(dialog); });
  window.addEventListener("pagehide", () => dispose?.());
  return { openTerminal, updateTitle };
}
