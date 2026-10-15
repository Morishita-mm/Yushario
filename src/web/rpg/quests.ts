import type { Quest, QuestBinding, QuestDetail, QuestReportLink } from "../../core/quests";
import type { RoomAgent } from "../../core/room";
import { tr } from "../language";
import { questCard } from "../town/quest-card";
import { questStateLabel, renderQuestList } from "../town/quest-list";
import { coverMap } from "./talk";
import type { Project } from "../town/world";
import { worktreeRequest, type BaseInfo } from "./expedition-bases";
import { openReview } from "./review-window";
import { reportQuestTitle } from "./report-links";

const token = new URLSearchParams(location.search).get("token") ?? "";
export async function questRequest(path = "", method = "GET", body?: unknown): Promise<any> {
  const response = await fetch(`/api/quests${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`, {
    method, cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error ?? tr("クエストを よめない", "Cannot read quests")); }
  return response.status === 204 ? undefined : response.json();
}
export function initQuests(town: () => string | undefined, projects: () => Project[],
  hero: (id: string) => RoomAgent | undefined, name: (id: string) => string | undefined,
  select: (id: string) => void, talk: (id: string, at?: number) => void, counted: (count: number) => void,
  embark: (quest: Quest) => void, townName: (key: string) => string, preview?: (quest: Quest) => HTMLElement, terminal?: (session: string) => void,
  draft?: (session: string, text: string) => void) {
  const root = document.querySelector<HTMLElement>("#quests")!;
  const dialog = document.createElement("dialog"); dialog.className = "report-window quest-window";
  const heading = document.createElement("h3"), content = document.createElement("div"), close = document.createElement("button");
  heading.id = `quest-title-${crypto.randomUUID()}`; dialog.setAttribute("aria-labelledby", heading.id);
  close.type = "button"; close.textContent = tr("▶ とじる", "▶ Close"); close.onclick = () => dialog.close();
  dialog.append(heading, content, close); document.body.append(dialog);
  dialog.addEventListener("keydown", (event) => event.stopPropagation());
  window.addEventListener("resize", () => { if (dialog.open) coverMap(dialog); });
  dialog.addEventListener("click", (event) => { if (event.target === dialog) {
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  } });
  let quests: Quest[] = [], bindings: QuestBinding[] = [], signature = "", selected: string | undefined;
  let shown: Pick<Quest, "title" | "purpose" | "state"> | undefined; // What the open card shows, after its own saves.
  let generation = 0;
  const label = townName;
  const heroLabel = (quest: Quest) => quest.hero ? name(quest.hero) ?? hero(quest.hero)?.name ?? quest.hero : "";
  function show(title: string): void { heading.textContent = title; coverMap(dialog); if (!dialog.open) dialog.showModal(); }
  const editing = () => Boolean(content.querySelector('[data-dirty="true"]')) || content.contains(document.activeElement);
  async function open(id: string, refresh = false): Promise<void> {
    selected = id; const version = ++generation;
    const quest: QuestDetail = await questRequest(`/${encodeURIComponent(id)}`);
    if (version !== generation || refresh && (!dialog.open || editing())) return;
    shown = { title: quest.title, purpose: quest.purpose, state: quest.state };
    content.replaceChildren(questCard(quest, heroLabel(quest), async (patch) => {
        if (patch.state) {
          const latest: QuestDetail = await questRequest(`/${encodeURIComponent(id)}`);
          if (latest.state !== quest.state && !confirm(tr(`この クエストは いま「${questStateLabel(latest.state)}」に なっている。「${questStateLabel(patch.state)}」に かえる？`,
            `This quest is now "${questStateLabel(latest.state)}". Change it to "${questStateLabel(patch.state)}"?`))) throw new Error(tr("ほぞんを やめた", "Save cancelled"));
        }
        const { adoption, ...fields } = patch;
        // "Done" goes through adopt, so the server records which state was accepted.
        const edits = adoption ? { ...fields, state: undefined } : fields;
        if (edits.title !== undefined || edits.purpose !== undefined || edits.state !== undefined) await questRequest(`/${id}`, "PATCH", edits);
        if (adoption) await questRequest(`/${encodeURIComponent(id)}/adopt`, "POST", { ...(adoption.reason.trim() ? { reason: adoption.reason } : {}), ...(adoption.pr.trim() ? { pr: adoption.pr } : {}) });
        if (shown) shown = { ...shown, ...fields };
        if (adoption) await open(id); // Show the accepted record at once.
      },
      () => { if (quest.hero && hero(quest.hero)) { dialog.close(); select(quest.hero); } },
      (id, at) => { if (hero(id)) { dialog.close(); talk(id, at); } },
      async () => { await questRequest(`/${id}`, "DELETE"); dialog.close(); },
      () => { dialog.close(); embark(quest); },
      async () => {
        if (!quest.worktreePath) return;
        const info = await worktreeRequest<BaseInfo>("GET", quest.worktreePath);
        await worktreeRequest("DELETE", info.root, { path: quest.worktreePath });
        await questRequest(`/${id}/base`, "DELETE"); await open(id);
      }, preview?.(quest), {
        talk: (id, session) => { dialog.close(); if (hero(id)) talk(id); else terminal?.(session); },
        review: (id, session) => { dialog.close(); openReview(name(id) ?? hero(id)?.name ?? id, hero(id) ? session : { quest: quest.id },
          hero(id) ? (text) => text && draft ? draft(session, text) : talk(id) : undefined, hero(id) ? () => terminal?.(session) : undefined); },
        embark: () => { dialog.close(); embark(quest); },
      }, () => { dialog.close(); openReview(quest.title, { quest: quest.id }, undefined, undefined); }));
    show(quest.title);
  }
  // A draft is kept, but the person is told the quest changed underneath it.
  function staleNotice(): void {
    if (content.querySelector(".quest-stale")) return;
    const id = selected, notice = document.createElement("p"), reload = document.createElement("button");
    notice.className = "hint quest-stale"; notice.setAttribute("role", "status");
    notice.textContent = tr("あたらしい 知らせが ある。ほぞんすると かきかえた所だけ のこる。", "This quest has changed. Saving keeps only the fields you edited.");
    reload.type = "button"; reload.textContent = tr("▶ さいしんに する（かきかけは きえる）", "▶ Reload (discards your draft)");
    reload.onclick = () => { if (id) void open(id); };
    notice.append(" ", reload); content.querySelector(".quest-card")?.prepend(notice);
  }
  function create(session?: string, townKey = town()): void {
    selected = undefined; ++generation;
    const form = document.createElement("form"), input = document.createElement("input"), purpose = document.createElement("textarea"), towns = document.createElement("select"), status = document.createElement("p");
    for (const project of projects()) towns.append(new Option(project.label ?? project.repo, project.repo));
    if (townKey) towns.value = townKey;
    input.required = true; input.maxLength = 200; purpose.maxLength = 2000;
    for (const [text, field] of [[tr("町", "Town"), towns], [tr("題", "Title"), input], [tr("目的", "Purpose"), purpose]] as const) {
      const label = document.createElement("label"); label.append(document.createTextNode(text), field); form.append(label);
    }
    const submit = document.createElement("button"); submit.type = "submit"; submit.textContent = tr("▶ つくる", "▶ Create"); form.append(submit, status);
    form.onsubmit = (event) => { event.preventDefault(); submit.disabled = true;
      void questRequest("", "POST", { town: towns.value, title: input.value.trim(), purpose: purpose.value }).then(async (quest: Quest) => {
        if (session) await questRequest(`/${quest.id}/assign`, "POST", { session });
        await open(quest.id);
      }).catch((error: Error) => { status.textContent = error.message; submit.disabled = false; });
    };
    content.replaceChildren(form); show(tr("あたらしい クエスト", "New quest")); input.focus();
  }
  function choose(session: string, townKey: string): void {
    selected = undefined; ++generation;
    const list = document.createElement("div");
    renderQuestList(list, quests.filter((quest) => quest.town === townKey), label, heroLabel,
      (quest) => { void questRequest(`/${quest.id}/assign`, "POST", { session }).then(() => dialog.close()).catch((error: Error) => { heading.textContent = error.message; }); },
      () => create(session, townKey), Date.now());
    content.replaceChildren(list); show(tr("べつの クエストに する", "Switch quest"));
  }
  function render(): void {
    const list = quests.filter((quest) => town() === undefined || quest.town === town()); counted(list.length);
    const next = JSON.stringify([list, list.map((quest) => label(quest.town)), list.map(heroLabel), Math.floor(Date.now() / 60_000)]);
    if (signature === next) return; signature = next;
    renderQuestList(root, list, label, heroLabel, (quest) => { void open(quest.id); }, () => create(), Date.now());
  }
  function set(data: { quests: Quest[]; bindings: QuestBinding[]; reports?: QuestReportLink[] }): void {
    quests = data.quests; bindings = data.bindings; signature = ""; render();
    if (selected && dialog.open) {
      if (!quests.some((quest) => quest.id === selected)) dialog.close();
      else if (!editing()) void open(selected, true);
      else {
        const now = quests.find((quest) => quest.id === selected);
        if (now && shown && (now.title !== shown.title || now.purpose !== shown.purpose || now.state !== shown.state)) staleNotice();
      }
    }
  }
  return { set, render, choose, open,
    reportTitle: (hero: string, at: number) => reportQuestTitle(hero, at, quests),
    current: (session: string) => quests.find((quest) => quest.id === bindings.find((item) => item.session === session)?.quest) };
}
