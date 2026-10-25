import { language, tr } from "../language";
import { connectSessionTerminal, sessionRequest, type Session } from "../terminal";
import { loadSettings, loadTowns, type TownRecord } from "./ledger";
import { coverMap } from "./talk";
import { codexNotice, loadAgents, type AgentInfo } from "./agents";
import type { EquipmentMaster } from "../../core/equipment";
import { loadEquipment } from "./equipment";
import { initExpeditionBases } from "./expedition-bases";
import type { Quest } from "../../core/quests";
import { roleLabel, type PartyRole } from "../../core/party";
// `text`: with assign, the quest text that starts the new hero (the server launches the CLI with it and assigns the quest).
// `helper`: the new hero joins the quest as a helper; "now" asks for its role and first request, "gathering" sends nothing yet.
export type Landing = { assign: boolean; text?: string; helper?: "now" | "gathering"; arrived: (session: Session) => void | Promise<void> };
import { townLabel } from "../../core/town-ledger";
import "./worktrees.css";

const CLAUDE_SETUP = "https://code.claude.com/docs/en/setup";

// Page-local windows. All session ownership stays on the server.
export function initExpedition(currentTown: () => string | undefined, heroName: (terminal: string) => string | undefined,
  launched: (session: Session, towns: TownRecord[], quiet: boolean) => void, talkHero: (terminal: string) => string | undefined,
  openTalk: (id: string) => void, townName: (key: string) => string) {
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
  const helperRole = document.querySelector<HTMLSelectElement>("#expedition-role")!;
  const helperText = document.querySelector<HTMLTextAreaElement>("#expedition-text")!;
  const helperHint = document.querySelector<HTMLElement>("#expedition-hint")!;
  let agents: AgentInfo[] = [], equipment: EquipmentMaster = {};
  let quest: Quest | undefined;
  const bases = initExpeditionBases(document.querySelector<HTMLElement>("#expedition-bases")!, heroName,
    (preset) => Boolean(agents.find((agent) => agent.id === preset)?.hero));
  const weapon = document.querySelector<HTMLSelectElement>("#expedition-weapon")!;
  const accessory = document.querySelector<HTMLSelectElement>("#expedition-accessory")!;
  const describe = () => {
    document.querySelector<HTMLElement>("#expedition-capability")!.textContent = preset.value === "codex" ? codexNotice()
      : agents.find((agent) => agent.id === preset.value)?.hero
        ? tr("町・会話に 対応", "Town and conversation supported")
        : tr("ターミナルのみ（勇者は出ない）", "Terminal only (no hero appears)");
    const items = equipment[preset.value];
    weapon.replaceChildren(new Option(tr("そうびなし（きほん）", "None (default)"), ""));
    accessory.replaceChildren(new Option(tr("そうびなし（きほん）", "None (default)"), ""));
    for (const item of items?.weapons ?? []) weapon.add(new Option(`${item.name}（${item.model}）`, item.id));
    for (const item of items?.accessories ?? []) accessory.add(new Option(`${item.name}（${item.value}）`, item.id));
    weapon.hidden = document.querySelector<HTMLElement>("#expedition-weapon-label")!.hidden = !items?.weapons.length;
    accessory.hidden = document.querySelector<HTMLElement>("#expedition-accessory-label")!.hidden = !items?.accessories.length;
  };
  // A new helper: choose its role and first request (now), or only be told how it starts (while forming the party).
  const helperFields = () => {
    const mode = landing?.helper, now = mode === "now";
    for (const id of ["role-label", "text-label"]) document.querySelector<HTMLElement>(`#expedition-${id}`)!.hidden = !now;
    helperRole.hidden = helperText.hidden = !now;
    helperHint.hidden = !mode;
    helperHint.textContent = mode === "gathering"
      ? tr("編成中は 何も送らない。新しい Codex は 最初の頼みごとを 自分のターミナルに 打つ必要がある。編成を終えてから 出陣させてもよい。", "Nothing is sent while forming. A new Codex must be given its first request in its own terminal, or embark it after forming.")
      : mode === "now" ? tr("この頼みごとで 起動して、そのまま 手伝いとして パーティーに入る。", "It starts with this request and joins the party as a helper.") : "";
  };
  preset.addEventListener("change", describe);
  let dispose: (() => void) | undefined;
  let attached: Session | undefined;
  let opening = 0;
  let launching = 0;

  function closeTerminal(): void {
    opening++;
    dispose?.(); dispose = undefined; attached = undefined;
    dialog.close();
  }
  // Where to go back when the person closes the launch window without launching (e.g. the party window).
  let back: (() => void) | undefined;
  // Where a launch from a quest or the party window lands instead of the talk window, and whether the
  // new hero takes the quest. Without it (the header button), the hero's talk window opens as before.
  let landing: Landing | undefined;
  function closeLaunch(): void { launching++; back = undefined; launch.close(); }
  function cancelLaunch(): void { const previous = back; closeLaunch(); previous?.(); }
  for (const [window, close] of [[launch, cancelLaunch], [dialog, closeTerminal]] as const) {
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
    const id = attached && !attached.exited ? talkHero(attached.id) : undefined;
    if (id) { closeTerminal(); openTalk(id); }
  });
  document.querySelector("#expedition-close")!.addEventListener("click", cancelLaunch);

  function updateTitle(): void {
    talk.hidden = !attached || Boolean(attached.exited) || !talkHero(attached.id);
    if (!attached) return;
    const name = heroName(attached.id) ?? `${townName(attached.project)} / ${attached.preset}${attached.branch ? ` [${attached.branch}]` : ""}`;
    const text = tr(`${name} — ターミナル`, `${name} — Terminal`);
    if (title.textContent !== text) title.textContent = text;
  }
  function attach(session: Session): void {
    attached = session;
    updateTitle();
    dispose = connectSessionTerminal(container, session, terminalStatus, () => {
      void sessionRequest().then((result) => {
        if (attached !== session) return;
        const latest = (result as Session[]).find((item) => item.id === session.id);
        if (latest?.exited) terminalStatus.textContent = tr(`おわった (${latest.exited.code})`, `Ended (${latest.exited.code})`);
        else if (!latest) terminalStatus.textContent = tr("このターミナルは もうない。", "This terminal is gone.");
      }).catch((error: Error) => { if (attached === session) terminalStatus.textContent = error.message; });
    }).dispose;
  }
  function prepareTerminal(): number {
    closeLaunch(); closeTerminal();
    title.textContent = tr("ターミナル", "Terminal"); talk.hidden = true;
    terminalStatus.textContent = tr("よみこみ中…", "Loading…");
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
      if (!session) throw new Error(tr("このターミナルは もうない。一覧をたしかめよう。", "This terminal is gone. Check the list."));
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
  const loadBases = () => bases.load(destination.value || path.value.trim());
  destination.addEventListener("change", () => { chooseDestination(); void loadBases(); });
  path.addEventListener("change", () => void loadBases());
  document.querySelector("#expedition")!.addEventListener("click", () => openLaunch());
  function openLaunch(selectedQuest?: Quest, returnTo?: () => void, land?: Landing): void {
    quest = selectedQuest; back = returnTo; landing = land;
    helperRole.replaceChildren(...(["research", "review", "test"] as PartyRole[]).map((role) => new Option(roleLabel(role, language), role)));
    helperText.value = ""; helperFields(); bases.setQuest(quest); void bases.load("");
    const request = ++launching;
    preset.replaceChildren();
    preset.disabled = true;
    destination.replaceChildren(new Option(tr("ほかの フォルダ", "Other folder"), ""));
    destination.disabled = start.disabled = true;
    path.value = "";
    chooseDestination();
    status.textContent = tr("よみこみ中…", "Loading…");
    document.querySelector<HTMLElement>("#expedition-capability")!.textContent = "";
    launch.showModal(); path.focus();
    const selectedTown = quest?.town ?? currentTown();
    void Promise.allSettled([loadTowns(), loadAgents(), loadEquipment(), loadSettings()]).then(([towns, kinds, gear, settings]) => {
      if (launching !== request || !launch.open) return;
      const errors: string[] = [];
      let noAgent = false;
      equipment = gear.status === "fulfilled" ? gear.value : {};
      if (gear.status === "rejected") errors.push(tr("そうびを 読み込めなかった。そうびなしでも起動できる。", "Could not load equipment. Embark with none."));
      const startupCwd = settings.status === "fulfilled" ? settings.value.startupCwd : undefined;
      if (startupCwd) {
        destination.add(new Option(tr(`いまの フォルダ — ${startupCwd}`, `Current folder — ${startupCwd}`), startupCwd), 0);
        destination.value = startupCwd;
      } else errors.push(tr("起動したフォルダを 読み込めなかった。行き先を指定しよう。", "Could not load the startup folder. Choose a destination."));
      if (towns.status === "fulfilled") {
        for (const town of towns.value.filter((item) => item.archivedAt === undefined)) {
          if (town.path === startupCwd) continue;
          const option = new Option(`${townLabel(town, towns.value)} — ${town.path}`, town.path);
          destination.add(option, destination.options.length - 1);
          if ((town.key ?? town.name) === selectedTown) destination.value = town.path;
        }
        if (!startupCwd && !selectedTown && destination.options.length > 1) destination.selectedIndex = 0;
      } else errors.push(tr("町の台帳を 読み込めなかった。ほかのフォルダも指定できる。", "Could not load towns. Choose another folder."));
      const focusedPath = document.activeElement === path;
      chooseDestination();
      void loadBases();
      destination.disabled = false;
      if (kinds.status === "fulfilled") {
        agents = kinds.value;
        for (const agent of agents) preset.add(new Option(agent.label, agent.id));
        if (agents.some((agent) => agent.id === "claude")) preset.value = "claude";
        preset.disabled = false; start.disabled = !agents.length; describe();
        noAgent = agents.every((agent) => agent.id === "shell");
        if (noAgent) errors.push(
          tr("勇者の CLI が見つからない。下から一つ入れて PATH に追加し、yushario を Ctrl+C で止めて起動し直そう。shell は使える。\npi: npm install -g @earendil-works/pi-coding-agent\nCodex: npm install -g @openai/codex\nClaude Code: ", "No hero CLI found. Install one below and add it to PATH, stop yushario (Ctrl+C), then restart. Shell is ready.\npi: npm install -g @earendil-works/pi-coding-agent\nCodex: npm install -g @openai/codex\nClaude Code: "),
        );
      } else {
        errors.push(kinds.reason instanceof Error ? kinds.reason.message : tr("勇者の種類を 読み込めなかった。", "Could not load hero kinds."));
      }
      if (focusedPath && path.hidden) (preset.disabled ? destination : preset).focus();
      status.textContent = errors.join("\n");
      if (noAgent) {
        const link = Object.assign(document.createElement("a"), { href: CLAUDE_SETUP, textContent: CLAUDE_SETUP, target: "_blank", rel: "noopener" });
        status.append(link);
      }
    });
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (start.disabled) return;
    const request = launching;
    const selectedQuest = quest;
    start.disabled = true;
    status.textContent = tr("しゅつじん中…", "Embarking…");
    void bases.prepare(destination.value || path.value.trim()).then(async (cwd) => {
      if (launching !== request || !launch.open) return;
      const hero = Boolean(agents.find((agent) => agent.id === preset.value)?.hero);
      const initial = selectedQuest && landing?.assign && hero ? landing.text?.trim() : undefined;
      const helper = selectedQuest && hero && landing?.helper === "now";
      const first = helper ? helperText.value.trim() : "";
      return sessionRequest("POST", "", { preset: preset.value, cwd,
        ...(weapon.value ? { weapon: weapon.value } : {}), ...(accessory.value ? { accessory: accessory.value } : {}),
        ...(helper ? { quest: selectedQuest.id, role: helperRole.value, ...(first ? { text: first } : {}) }
          : selectedQuest && initial ? { quest: selectedQuest.id, text: initial } : {}) });
    }).then(async (result) => {
      if (!result) return;
      const land = landing;
      const session = result as Session;
      // The quest text already started (and assigned) the hero; otherwise the quest is assigned here.
      if (selectedQuest && (land?.assign ?? true) && !(land?.text?.trim() && agents.find((agent) => agent.id === session.preset)?.hero)) {
        const token = new URLSearchParams(location.search).get("token") ?? "";
        const response = await fetch(`/api/quests/${encodeURIComponent(selectedQuest.id)}/assign?${new URLSearchParams({ token })}`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session: session.id }),
        });
        if (!response.ok) throw new Error((await response.json()).error);
      }
      if (launching !== request || !launch.open) return; // Closing never cancels or deletes a created session.
      // Terminal-only presets must never wait for a hero who cannot arrive.
      if (!agents.find((agent) => agent.id === session.preset)?.hero) { prepareTerminal(); attach(session); return; }
      const towns = await loadTowns();
      if (launching !== request || !launch.open) return;
      closeLaunch();
      launched(session, towns, Boolean(land));
      await land?.arrived(session);
      // Codex's folder-trust and hooks review wait in its terminal, ahead of the initial prompt.
      if (session.preset === "codex") await openTerminal(session.id);
    }).catch((error: Error) => {
      if (launching === request && launch.open) status.textContent = error.message;
    }).finally(() => { if (launching === request) start.disabled = false; });
  });
  window.addEventListener("resize", () => { if (dialog.open) coverMap(dialog); });
  window.addEventListener("pagehide", () => dispose?.());
  return { openTerminal, updateTitle, openLaunch };
}
