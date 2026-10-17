import { dateTime, tr } from "../language";
import type { RosterEntry } from "../../core/roster";
import type { Session } from "../terminal";
import { loadTowns, type TownRecord } from "./ledger";

export function initRoster(recalled: (session: Session, towns: TownRecord[]) => void, townName: (key: string) => string): void {
  const dialog = document.querySelector<HTMLDialogElement>("#roster-dialog")!;
  const list = document.querySelector<HTMLElement>("#roster-list")!;
  const status = document.querySelector<HTMLElement>("#roster-status")!;
  const token = new URLSearchParams(location.search).get("token") ?? "";
  let request = 0, recalling = false;
  const close = () => { request++; dialog.close(); };
  document.querySelector("#roster-close")!.addEventListener("click", close);
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape" && !event.isComposing) { event.preventDefault(); close(); }
  });
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  });
  async function fetchRoster(suffix = "", method = "GET"): Promise<RosterEntry[] | Session> {
    const response = await fetch(`/api/roster${suffix}?${new URLSearchParams({ token })}`, { method, cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? tr(`めいぼを 読み込めなかった（${response.status}）`, `Could not load roster (${response.status})`));
    return data;
  }
  async function recall(entry: RosterEntry): Promise<void> {
    if (recalling) return;
    recalling = true;
    const current = request;
    for (const button of list.querySelectorAll<HTMLButtonElement>("button")) button.disabled = true;
    status.textContent = tr(`${entry.name}を よびもどしている…`, `Recalling ${entry.name}…`);
    try {
      const session = await fetchRoster(`/${encodeURIComponent(entry.sessionId)}/recall`, "POST") as Session;
      const towns = await loadTowns();
      if (request !== current || !dialog.open) return;
      close(); recalled(session, towns);
    } catch (error) {
      if (request === current && dialog.open) status.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      recalling = false;
      for (const button of list.querySelectorAll<HTMLButtonElement>("button")) button.disabled = false;
    }
  }
  document.querySelector("#roster")!.addEventListener("click", () => {
    const current = ++request;
    list.replaceChildren(); status.textContent = tr("めいぼを よみこみ中…", "Loading roster…");
    dialog.showModal();
    void fetchRoster().then((data) => {
      if (request !== current || !dialog.open) return;
      const entries = data as RosterEntry[];
      status.textContent = entries.length ? "" : tr("まだ だれも 旅立っていない。", "No one has set off yet.");
      for (const entry of [...entries].sort((a, b) => b.leftAt - a.leftAt)) {
        const row = document.createElement("div"); row.className = "roster-row";
        const text = document.createElement("div");
        const name = document.createElement("p"); name.className = "name"; name.textContent = tr(`${entry.name}（${townName(entry.project)}）`, `${entry.name} (${townName(entry.project)})`);
        const left = document.createElement("p"); left.className = "last";
        left.textContent = tr(`${dateTime(entry.leftAt)} に たびだった`, `Left ${dateTime(entry.leftAt)}`);
        text.append(name, left);
        const button = document.createElement("button"); button.type = "button"; button.textContent = tr("▶ よびもどす", "▶ Recall");
        button.title = entry.cwd; button.disabled = recalling;
        button.addEventListener("click", () => void recall(entry));
        row.append(text, button); list.append(row);
      }
    }).catch((error: unknown) => {
      if (request === current && dialog.open) status.textContent = error instanceof Error ? error.message : String(error);
    });
  });
}
