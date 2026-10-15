import { previewNotice, previewRecipients, type PreviewLink, type PreviewPage } from "../../core/preview";
import type { Quest } from "../../core/quests";
import type { RoomAgent } from "../../core/room";
import { tr } from "../language";
import { questPreview } from "../town/quest-preview";
import { forgetPreviewTab, previewTabMatches } from "../town/preview-tabs";
import { previewControls, type PreviewRecipient } from "../town/preview-controls";
import { partyRequest, type PartyHero } from "../town/quest-party";

type Scope = { key: string; quest?: string; town: string; session?: string; links: PreviewLink[]; candidates: string[];
  checked: number; loading: boolean; error: string; party: PartyHero[] };
type Mount = { scope: Scope; full: boolean; signature: string };
const token = new URLSearchParams(location.search).get("token") ?? "";
const port = Number(location.port || (location.protocol === "https:" ? 443 : 80));

export function initPreview(tell: (session: string, text: string) => void) {
  const scopes = new Map<string, Scope>(), pages = new Map<string, PreviewPage>(), mounts = new Map<HTMLElement, Mount>();
  const script = `<script src="${location.origin}/preview-link.js"></script>`;
  function scope(town: string, quest?: Quest, session?: string): Scope {
    const key = quest?.id ?? `town-${town}`;
    let value = scopes.get(key);
    if (!value) {
      value = { key, town, quest: quest?.id, session: quest ? quest.writerSession : session, links: [], candidates: [], checked: 0, loading: false, error: "", party: [] };
      scopes.set(key, value);
    }
    value.session = quest ? quest.writerSession : session ?? value.session; return value;
  }
  async function request(value: Scope, method = "GET", body?: unknown, id?: string): Promise<any> {
    const query = new URLSearchParams({ token, ...(value.quest ? { quest: value.quest } : { town: value.town }), ...(id ? { id } : {}) });
    const response = await fetch(`/api/previews?${query}`, { method, cache: "no-store",
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error ?? tr("プレビューを よめない", "Cannot read previews")); }
    return response.status === 204 ? undefined : response.json();
  }
  async function refresh(value: Scope): Promise<void> {
    if (value.loading) return; value.loading = true; value.checked = Date.now();
    try {
      const [data, members] = await Promise.all([request(value), value.quest ? partyRequest(`quests/${encodeURIComponent(value.quest)}/party`) as Promise<PartyHero[]> : Promise.resolve([])]);
      for (const link of value.links) if (!data.links.some((current: PreviewLink) => current.id === link.id && current.url === link.url)) { pages.delete(link.id); forgetPreviewTab(value.key, link.id); }
      value.links = data.links; value.candidates = data.candidates; value.party = members; value.error = "";
    }
    catch (error) { value.error = (error as Error).message; }
    finally { value.loading = false; paint(); }
  }
  function paint(): void {
    for (const [root, mount] of mounts) {
      if (!root.isConnected) continue;
      const value = mount.scope;
      const signature = JSON.stringify([value.links, value.candidates, value.links.map((link) => pages.get(link.id)), value.error, value.session, value.party]);
      if (signature === mount.signature) continue; mount.signature = signature;
      const recipients: PreviewRecipient[] | undefined = value.quest
        ? previewRecipients(value.party, value.session)?.map((member) => ({ session: member.session,
          name: `${member.name}${member.canTalk ? "" : tr(" · ターミナルのみ", " · Terminal only")}`, disabled: !member.canTalk })) : undefined;
      const draft = value.quest || value.session ? (text: string, chosen?: string) => {
        const target = recipients ? chosen : value.session;
        if (target) tell(target, text);
      } : undefined;
      if (mount.full) {
        const inputs = [...root.querySelectorAll("input")], focused = inputs.indexOf(document.activeElement as HTMLInputElement);
        const fields = inputs.map((input) => input.value);
        root.replaceChildren(questPreview({ key: value.key, links: value.links, candidates: value.candidates, pages, script, tell: draft, recipients,
          add: async (name, url) => { await request(value, "POST", { name, url }); await refresh(value); },
          remove: async (id) => { await request(value, "DELETE", undefined, id); pages.delete(id); await refresh(value); } }));
        [...root.querySelectorAll("input")].forEach((input, i) => { input.value = fields[i] ?? ""; if (i === focused) input.focus(); });
        if (value.error) { const error = document.createElement("p"); error.setAttribute("role", "status"); error.textContent = value.error; root.append(error); }
      } else root.replaceChildren(previewControls(value.key, value.links, pages, draft, recipients));
    }
  }
  function mount(value: Scope, full: boolean): HTMLElement {
    const root = document.createElement("div"); root.className = full ? "preview-section" : "preview-shortcut";
    mounts.set(root, { scope: value, full, signature: "" }); void refresh(value); return root;
  }
  function openTown(value: Scope): void {
    const dialog = document.createElement("dialog"); dialog.className = "report-window preview-window";
    const close = document.createElement("button"); close.type = "button"; close.textContent = tr("▶ とじる", "▶ Close"); close.onclick = () => dialog.close();
    dialog.append(mount(value, true), close); dialog.addEventListener("close", () => dialog.remove(), { once: true });
    dialog.addEventListener("keydown", (event) => event.stopPropagation()); document.body.append(dialog); dialog.showModal(); paint();
  }
  window.addEventListener("message", (event) => {
    if (!event.data || event.data.type !== "yushario-preview") return;
    for (const value of scopes.values()) for (const link of value.links) {
      if (!previewTabMatches(value.key, link.id, event.source)) continue;
      const page = previewNotice(event.data, event.origin, link.url, port);
      if (page) pages.set(link.id, page);
    }
    paint();
  });
  function decorate(agents: Iterable<RoomAgent>, current: (session: string) => Quest | undefined, town?: string): void {
    for (const [root] of mounts) if (!root.isConnected) mounts.delete(root);
    for (const root of document.querySelectorAll<HTMLElement>("[data-quest]")) {
      const id = root.dataset.quest;
      if (!id || root.querySelector(".preview-shortcut")) continue;
      const value = scopes.get(id);
      if (value) root.append(mount(value, false));
    }
    for (const agent of agents) {
      const quest = agent.terminal ? current(agent.terminal) : undefined;
      if (!agent.project) continue;
      const value = scope(agent.project, quest, agent.terminal);
      for (const root of document.querySelectorAll<HTMLElement>(`[data-agent="${CSS.escape(agent.id)}"]`)) {
        const previous = root.querySelector<HTMLElement>(".preview-shortcut");
        if (previous && mounts.get(previous)?.scope !== value) previous.remove();
        if (!root.querySelector(".preview-shortcut")) root.querySelector("header")?.after(mount(value, false));
      }
    }
    const questsRoot = document.querySelector<HTMLElement>("#quests");
    const townButton = questsRoot?.querySelector<HTMLElement>(".preview-town");
    if (townButton && townButton.dataset.town !== town) townButton.remove();
    if (town && questsRoot && !questsRoot.querySelector(".preview-town")) {
      const button = document.createElement("button"); button.type = "button"; button.className = "preview-town"; button.dataset.town = town;
      button.textContent = tr("▶ 町の プレビュー", "▶ Town preview"); button.onclick = () => openTown(scope(town)); questsRoot.prepend(button);
    }
    const visible = [...mounts].filter(([root]) => root.getClientRects().length).map(([, item]) => item.scope);
    for (const value of new Set(visible)) if (Date.now() - value.checked > 2000) void refresh(value);
    paint();
  }
  return { section: (quest: Quest) => mount(scope(quest.town, quest), true),
    remember: (quests: Quest[]) => {
      const ids = new Set(quests.map((quest) => quest.id));
      for (const [key, value] of scopes) if (value.quest && !ids.has(value.quest)) {
        for (const link of value.links) pages.delete(link.id); forgetPreviewTab(key); scopes.delete(key);
      }
      for (const quest of quests) scope(quest.town, quest);
    }, decorate };
}
