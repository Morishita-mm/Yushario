import { questTitle, type Quest, type QuestBinding, type QuestDetail, type QuestReportLink } from "../../core/quests";
import type { RoomAgent } from "../../core/room";
import { tr } from "../language";
import { questCard, type TownHero } from "../town/quest-card";
import { partyRequest, type HeroInfo, type PartyControls } from "../town/quest-party";
import type { TacticStatus } from "../../core/tactics";
import { openPartyWindow } from "../town/party-window";
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
  embark: (quest: Quest, back?: () => void) => void, townName: (key: string) => string, preview?: (quest: Quest) => HTMLElement, terminal?: (session: string) => void,
  draft?: (session: string, text: string) => void, heroesIn: (town: string) => RoomAgent[] = () => [], farewell?: (hero: string) => void,
  heroInfo?: (session: string) => HeroInfo) {
  const root = document.querySelector<HTMLElement>("#quests")!;
  const dialog = document.createElement("dialog"); dialog.className = "report-window quest-window";
  const heading = document.createElement("h3"), content = document.createElement("div"), close = document.createElement("button");
  heading.id = `quest-title-${crypto.randomUUID()}`; dialog.setAttribute("aria-labelledby", heading.id);
  close.type = "button"; close.className = "quest-close"; close.textContent = "×"; close.setAttribute("aria-label", tr("とじる", "Close")); close.onclick = () => dialog.close();
  dialog.append(close, heading, content); document.body.append(dialog);
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
  // A hero no longer in town has no name to show; never show its raw session id.
  const heroText = (id?: string) => id ? name(id) ?? hero(id)?.name ?? tr("町を去った勇者", "A hero who left") : "";
  const heroLabel = (quest: Quest) => heroText(quest.hero);
  // A saved owner may have left (for example across a server restart).
  const ownerHere = (quest: Quest) => quest.hero ? Boolean(hero(quest.hero)) : Boolean(quest.session);
  function show(title: string): void { heading.textContent = title; coverMap(dialog); if (!dialog.open) dialog.showModal(); }
  const editing = () => Boolean(content.querySelector('[data-dirty="true"]')) || content.contains(document.activeElement);
  // Heroes now in a town, for choosing who takes a quest.
  const townHeroes = (key: string): TownHero[] => heroesIn(key).filter((agent) => agent.terminal)
    .map((agent) => ({ session: agent.terminal!, name: name(agent.id) ?? agent.name, busy: agent.activity !== "idle" && agent.activity !== "rest" }));
  const sendRequest = async (id: string, session: string, text: string): Promise<boolean> =>
    Boolean((await questRequest(`/${encodeURIComponent(id)}/send`, "POST", { session, text }))?.delivered);
  function reviewQuest(quest: Quest): void {
    dialog.close();
    const session = quest.session, id = quest.hero;
    if (id && session && hero(id)) openReview(name(id) ?? hero(id)?.name ?? id, session, (text) => text && draft ? draft(session, text) : talk(id), () => terminal?.(session));
    else openReview(quest.title, { quest: quest.id }, undefined, undefined);
  }
  function partyControls(quest: Quest): PartyControls {
    return {
      talk: (id, session) => { dialog.close(); if (hero(id)) talk(id); else terminal?.(session); },
      review: (id, session) => { dialog.close(); openReview(name(id) ?? hero(id)?.name ?? id, hero(id) ? session : { quest: quest.id },
        hero(id) ? (text) => text && draft ? draft(session, text) : talk(id) : undefined, hero(id) ? () => terminal?.(session) : undefined); },
      embark: (back) => { dialog.close(); embark(quest, back); },
      farewell, heroInfo, sessionName: (session) => { const agent = heroesIn(quest.town).find((item) => item.terminal === session); return agent && (name(agent.id) ?? agent.name); },
    };
  }
  async function open(id: string, refresh = false): Promise<void> {
    selected = id; const version = ++generation;
    const [quest, tactic]: [QuestDetail, TacticStatus | undefined] = await Promise.all([questRequest(`/${encodeURIComponent(id)}`),
      partyRequest(`quests/${encodeURIComponent(id)}/tactic`).catch(() => undefined)]);
    if (version !== generation || refresh && (!dialog.open || editing())) return;
    shown = { title: quest.title, purpose: quest.purpose, state: quest.state };
    const session = quest.session;
    content.replaceChildren(questCard(quest, {
      heroName: heroText, ownerHere: ownerHere(quest),
      save: async (patch) => {
        if (patch.state) {
          const latest: QuestDetail = await questRequest(`/${encodeURIComponent(id)}`);
          if (latest.state !== quest.state && !confirm(tr(`この クエストは いま「${questStateLabel(latest.state)}」に なっている。「${questStateLabel(patch.state)}」に かえる？`,
            `This quest is now "${questStateLabel(latest.state)}". Change it to "${questStateLabel(patch.state)}"?`))) throw new Error(tr("ほぞんを やめた", "Save cancelled"));
        }
        const { adoption, ...fields } = patch;
        // Accepting goes through adopt, so the server records which state was accepted.
        const edits = adoption ? { ...fields, state: undefined } : fields;
        if (edits.title !== undefined || edits.purpose !== undefined || edits.state !== undefined) await questRequest(`/${id}`, "PATCH", edits);
        if (adoption) await questRequest(`/${encodeURIComponent(id)}/adopt`, "POST", { ...(adoption.reason.trim() ? { reason: adoption.reason } : {}), ...(adoption.pr.trim() ? { pr: adoption.pr } : {}) });
        if (shown) shown = { ...shown, ...fields };
        if (adoption) await open(id); // Show the accepted record at once.
      },
      remove: async () => { await questRequest(`/${id}`, "DELETE"); dialog.close(); },
      talk: (id, at) => { if (hero(id)) { dialog.close(); talk(id, at); } },
      focusHero: () => { if (quest.hero && hero(quest.hero)) { dialog.close(); select(quest.hero); } },
      townHeroes: () => townHeroes(quest.town),
      assign: async (chosen) => { await questRequest(`/${encodeURIComponent(id)}/assign`, "POST", { session: chosen }); await open(id); },
      send: session ? async (text, checks) => {
        for (const check of checks) await questRequest(`/${encodeURIComponent(id)}/checks`, "POST", check);
        return sendRequest(id, session, text);
      } : undefined,
      terminal: session ? () => { dialog.close(); terminal?.(session); } : undefined,
      embark: () => { dialog.close(); embark(quest); },
      fold: async () => {
        if (!quest.worktreePath) return;
        const info = await worktreeRequest<BaseInfo>("GET", quest.worktreePath);
        await worktreeRequest("DELETE", info.root, { path: quest.worktreePath });
        await questRequest(`/${id}/base`, "DELETE"); await open(id);
      },
      preview: preview?.(quest),
      party: partyControls(quest),
      review: () => reviewQuest(quest),
      reload: () => void open(id),
      tactic,
      stopTactic: async () => { await partyRequest(`quests/${encodeURIComponent(id)}/tactic`, "POST", { tactic: "obey" }); await open(id); },
      research: async (text) => { await partyRequest(`quests/${encodeURIComponent(id)}/research`, "POST", { text }); await open(id); },
    }));
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
  // One window for steps 1–3: write the request, choose who takes it, and send it.
  function create(session?: string, townKey = town()): void {
    selected = undefined; ++generation;
    const form = document.createElement("form"), request = document.createElement("textarea"), towns = document.createElement("select"), status = document.createElement("p");
    for (const project of projects()) towns.append(new Option(project.label ?? project.repo, project.repo));
    if (townKey) towns.value = townKey;
    request.required = true; request.maxLength = 2000; request.rows = 4;
    request.placeholder = tr("例：ログイン画面の エラー文を やさしくして。テストも 足して。", "e.g. Make the login error messages friendlier and add a test.");
    const who = document.createElement("fieldset"), primary = document.createElement("button"), only = document.createElement("button"), team = document.createElement("button");
    let choice = session ?? "";
    const label = (text: string, field: HTMLElement) => { const node = document.createElement("label"); node.append(document.createTextNode(text), field); return node; };
    const option = (value: string, text: string) => {
      const node = document.createElement("label"), radio = document.createElement("input"); radio.type = "radio"; radio.name = "quest-who"; radio.value = value;
      radio.checked = value === choice; radio.onchange = () => { choice = value; update(); }; node.append(radio, document.createTextNode(` ${text}`)); return node;
    };
    function heroes(): void {
      const list = townHeroes(towns.value);
      if (!list.some((item) => item.session === choice) && choice !== "embark") choice = list.find((item) => !item.busy)?.session ?? "";
      who.replaceChildren(Object.assign(document.createElement("legend"), { textContent: tr("任せる勇者", "Who takes it") }),
        ...list.map((item) => option(item.session, tr(`町にいる勇者：${item.name}（${item.busy ? "作業中" : "手があいている"}）`, `Hero in town: ${item.name} (${item.busy ? "working" : "free"})`))),
        option("embark", tr("新しく出陣させる", "Embark a new hero")), option("", tr("まだ決めない", "Decide later")));
      update();
    }
    function update(): void {
      primary.textContent = choice === "embark" ? tr("作って出陣させる", "Create and embark") : choice ? tr("作って依頼する", "Create and send") : tr("作る", "Create");
      team.textContent = choice === "embark" ? tr("作ってパーティーを編成する", "Create and form the party") : tr("作ってパーティーに依頼する", "Create and ask the party");
      only.hidden = !choice;
      if (only.hidden && pick === only) select(primary);
    }
    towns.onchange = heroes;
    primary.type = "submit"; only.type = "button"; only.textContent = tr("作るだけ", "Create only");
    team.type = "button";
    const choices = document.createElement("div"); choices.className = "quest-create-actions"; choices.append(primary, team, only);
    // A command menu: the chosen line (by pointer or ↑↓) alone carries the ▶ and the highlight.
    let pick = primary;
    function select(button: HTMLButtonElement): void {
      pick = button;
      for (const item of [primary, team, only]) item.setAttribute("aria-current", String(item === button));
    }
    for (const item of [primary, team, only]) { item.addEventListener("pointerenter", () => select(item)); item.addEventListener("focus", () => select(item)); }
    choices.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const shown = [primary, team, only].filter((item) => !item.hidden), at = shown.indexOf(pick);
      const next = shown[(at + (event.key === "ArrowDown" ? 1 : shown.length - 1)) % shown.length];
      event.preventDefault(); select(next); next.focus();
    });
    select(primary);
    form.append(label(tr("町", "Town"), towns), label(tr("依頼（1行目が クエストの名前になる）", "Request (the first line names the quest)"), request), who, choices, status);
    async function make(send: boolean, formParty = false): Promise<void> {
      const text = request.value.trim();
      if (!text) { request.reportValidity(); return; }
      primary.disabled = only.disabled = team.disabled = true;
      try {
        const quest: Quest = await questRequest("", "POST", { town: towns.value, title: questTitle(text), purpose: text });
        if (choice === "embark" && send) { dialog.close(); embark(quest); return; }
        if (choice && choice !== "embark") {
          await questRequest(`/${quest.id}/assign`, "POST", { session: choice });
          if (send) status.textContent = await sendRequest(quest.id, choice, text) ? tr("依頼を 届けた", "Request delivered") : tr("依頼を あずけた。勇者の 手が あいたら 届く", "Request held until the hero is free");
        }
        await open(quest.id);
        if (formParty) {
          const detail: QuestDetail = await questRequest(`/${encodeURIComponent(quest.id)}`);
          openPartyWindow(detail, partyControls(detail), () => void open(quest.id));
        }
      } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); primary.disabled = only.disabled = team.disabled = false; }
    }
    form.onsubmit = (event) => { event.preventDefault(); void make(true); };
    only.onclick = () => void make(false);
    team.onclick = () => void make(choice !== "embark", true);
    heroes(); content.replaceChildren(form); show(tr("新しいクエスト", "New quest")); request.focus();
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
    const next = JSON.stringify([list, list.map((quest) => label(quest.town)), list.map(heroLabel), list.map(ownerHere), Math.floor(Date.now() / 60_000)]);
    if (signature === next) return; signature = next;
    renderQuestList(root, list, label, heroLabel, (quest) => { void open(quest.id); }, () => create(), Date.now(), ownerHere, (quest) => {
      if (!confirm(tr(`「${quest.title}」の きろくを けす？`, `Delete the records of "${quest.title}"?`))) return;
      void questRequest(`/${encodeURIComponent(quest.id)}`, "DELETE").then(() => { if (selected === quest.id) dialog.close(); })
        .catch((error: Error) => { alert(error.message); });
    });
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
