import { connectSessionTerminal, sessionRequest, type Session } from "../terminal";
import { loadSettings, loadTowns, type TownRecord } from "./ledger";
import { coverMap } from "./talk";
import { loadAgents, supportText, type AgentInfo } from "./agents";
import type { EquipmentMaster } from "../../core/equipment";
import { loadEquipment } from "./equipment";

const CLAUDE_SETUP = "https://code.claude.com/docs/en/setup";

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
  const support = document.querySelector<HTMLElement>("#expedition-support")!;
  let agents: AgentInfo[] = [], equipment: EquipmentMaster = {};
  const weapon = document.querySelector<HTMLSelectElement>("#expedition-weapon")!;
  const accessory = document.querySelector<HTMLSelectElement>("#expedition-accessory")!;
  const describe = () => {
    const agent = agents.find((item) => item.id === preset.value); support.textContent = agent ? supportText(agent) : "";
    const items = equipment[preset.value];
    weapon.replaceChildren(new Option("そうびなし（きほん）", ""));
    accessory.replaceChildren(new Option("そうびなし（きほん）", ""));
    for (const item of items?.weapons ?? []) weapon.add(new Option(`${item.name}（${item.model}）`, item.id));
    for (const item of items?.accessories ?? []) accessory.add(new Option(`${item.name}（${item.value}）`, item.id));
    weapon.hidden = document.querySelector<HTMLElement>("#expedition-weapon-label")!.hidden = !items?.weapons.length;
    accessory.hidden = document.querySelector<HTMLElement>("#expedition-accessory-label")!.hidden = !items?.accessories.length;
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
    const id = attached && !attached.exited ? talkHero(attached.id) : undefined;
    if (id) { closeTerminal(); openTalk(id); }
  });
  document.querySelector("#expedition-close")!.addEventListener("click", closeLaunch);

  function updateTitle(): void {
    talk.hidden = !attached || Boolean(attached.exited) || !talkHero(attached.id);
    if (!attached) return;
    const name = heroName(attached.id) ?? `${attached.project} / ${attached.preset}`;
    const text = `${name} — ターミナル`;
    if (title.textContent !== text) title.textContent = text;
  }
  const hint = dialog.querySelector<HTMLElement>(".terminal-hint")!;
  function showEnded(ended: boolean): void {
    hint.textContent = ended ? "Esc・窓の外・とじる で 町にもどる。この ターミナルは おわっています（出力は のこります）。"
      : "Esc・窓の外・とじる で 町にもどる。勇者は うごきつづけます。";
  }
  function attach(session: Session): void {
    attached = session;
    showEnded(Boolean(session.exited));
    updateTitle();
    dispose = connectSessionTerminal(container, session, terminalStatus, () => {
      void sessionRequest().then((result) => {
        if (attached !== session) return;
        const latest = (result as Session[]).find((item) => item.id === session.id);
        if (latest?.exited) terminalStatus.textContent = `おわった (${latest.exited.code})・会話は のこっています`;
        else if (!latest) terminalStatus.textContent = "この ターミナルは なくなりました。";
        showEnded(Boolean(latest?.exited) || !latest);
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
    preset.replaceChildren(); support.textContent = "対応範囲を よみこみ中…";
    preset.disabled = true;
    destination.replaceChildren(new Option("ほかの フォルダ", ""));
    destination.disabled = start.disabled = true;
    path.value = "";
    chooseDestination();
    status.textContent = "よみこみ中…";
    launch.showModal();
    const selectedTown = currentTown();
    void Promise.allSettled([loadTowns(), loadAgents(), loadEquipment(), loadSettings()]).then(([towns, kinds, gear, settings]) => {
      if (launching !== request || !launch.open) return;
      const errors: string[] = [];
      let noAgent = false;
      equipment = gear.status === "fulfilled" ? gear.value : {};
      if (gear.status === "rejected") errors.push("そうびを よみこめませんでした。そうびなしで 起動できます。");
      const startupCwd = settings.status === "fulfilled" ? settings.value.startupCwd : undefined;
      if (startupCwd) {
        destination.add(new Option(`いまの フォルダ — ${startupCwd}`, startupCwd), 0);
        destination.value = startupCwd;
      } else errors.push("起動した フォルダを よみこめませんでした。行き先を 指定してください。");
      if (towns.status === "fulfilled") {
        for (const town of towns.value.filter((item) => item.archivedAt === undefined)) {
          if (town.path === startupCwd) continue;
          const option = new Option(`${town.name} — ${town.path}`, town.path);
          destination.add(option, destination.options.length - 1);
          if (town.name === selectedTown) destination.value = town.path;
        }
        if (!startupCwd && !selectedTown && destination.options.length > 1) destination.selectedIndex = 0;
      } else errors.push("町の台帳を よみこめませんでした。ほかの フォルダを 指定できます。");
      chooseDestination();
      destination.disabled = false;
      if (kinds.status === "fulfilled") {
        agents = kinds.value;
        for (const agent of agents) preset.add(new Option(`${agent.label} — ${agent.hero ? "町・会話に 対応" : "ターミナルのみ"}`, agent.id));
        if (agents.some((agent) => agent.id === "claude")) preset.value = "claude";
        preset.disabled = false; start.disabled = !agents.length; describe();
        noAgent = agents.every((agent) => agent.id === "shell");
        if (noAgent) errors.push(
          "勇者の CLI が 見つかりません。① 下から1つ入れて PATH に追加 → ② agent-quest を止める（Ctrl+C）→ ③ 起動し直す。shell は 使えます。\npi: npm install -g @earendil-works/pi-coding-agent\nCodex: npm install -g @openai/codex\nClaude Code: ",
        );
      } else {
        support.textContent = "対応範囲を よみこめないため 起動できません。";
        errors.push(kinds.reason instanceof Error ? kinds.reason.message : "勇者の 種類を よみこめませんでした。");
      }
      status.textContent = errors.join("\n");
      if (noAgent) {
        const link = Object.assign(document.createElement("a"), { href: CLAUDE_SETUP, textContent: CLAUDE_SETUP, target: "_blank", rel: "noopener" });
        status.append(link);
      }
    });
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (start.disabled) return;
    const request = launching;
    const cwd = destination.value || path.value.trim();
    start.disabled = true;
    status.textContent = "しゅつじん中…";
    void sessionRequest("POST", "", { preset: preset.value, cwd,
      ...(weapon.value ? { weapon: weapon.value } : {}), ...(accessory.value ? { accessory: accessory.value } : {}) }).then(async (result) => {
      if (launching !== request || !launch.open) return; // Closing never cancels or deletes a created session.
      const session = result as Session;
      // Terminal-only presets must never wait for a hero who cannot arrive.
      if (!agents.find((agent) => agent.id === session.preset)?.hero) { prepareTerminal(); attach(session); return; }
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
