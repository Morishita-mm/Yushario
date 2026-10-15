import { handoffScroll, summaryRequest } from "../../core/party-scroll";
import { checkMark } from "../../core/checks";
import type { QuestDetail } from "../../core/quests";
import { language, tr } from "../language";
import type { Session } from "../terminal";
import type { AgentInfo } from "../rpg/agents";
import { partyButton, partyField, partyRequest, type PartyControls, type PartyHero } from "./quest-party";

const drafts = new Map<string, string>();
export function questHandoff(quest: QuestDetail, members: PartyHero[], sessions: Session[], controls: PartyControls | undefined, status: HTMLElement, agents: AgentInfo[] = []): HTMLElement {
  const root = document.createElement("details"); root.className = "quest-handoff";
  const heading = document.createElement("summary"); heading.textContent = tr("▶ ひきつぎ", "▶ Handoff"); root.append(heading);
  root.addEventListener("toggle", () => { if (root.open) root.closest<HTMLElement>(".quest-party")!.dataset.dirty = "true"; });
  const draft = document.createElement("textarea"); draft.rows = 12; draft.maxLength = 8000;
  draft.value = drafts.get(quest.id) ?? handoffScroll(quest, quest.checks?.map((check) => ({ title: check.name, mark: checkMark(check.evidence, quest.fingerprint) })) ?? [], language);
  draft.oninput = () => { drafts.set(quest.id, draft.value); root.closest<HTMLElement>(".quest-party")!.dataset.dirty = "true"; };
  const recipient = document.createElement("select");
  function addRecipient(name: string, session: string, canTalk: boolean): void {
    const option = new Option(`${name}${canTalk ? "" : tr(" · ターミナルのみ", " · Terminal only")}`, session);
    option.disabled = !canTalk; recipient.append(option);
  }
  for (const session of sessions.filter((item) => item.project === quest.town && !item.exited && members.find((member) => member.session === item.id)?.active !== false)) addRecipient(`${members.find((member) => member.session === session.id)?.name ?? session.preset} · ${session.id}`, session.id, agents.some((agent) => agent.id === session.preset && agent.hero));
  if (controls?.mock) for (const member of members) addRecipient(member.name, member.session, Boolean(member.canTalk && member.active));
  recipient.append(new Option(tr("あたらしく 出陣", "Embark a new hero"), "new"));
  const launch = document.createElement("div"), kind = document.createElement("select"), cwd = document.createElement("input"); launch.hidden = true; cwd.value = quest.worktreePath ?? "";
  for (const agent of agents.length ? agents : controls?.mock ? [{ id: "claude", hero: true }, { id: "pi", hero: true }, { id: "codex", hero: false }, { id: "shell", hero: false }] : []) {
    const option = new Option(`${agent.id}${agent.hero ? "" : tr(" · ターミナルのみ", " · Terminal only")}`, agent.id);
    option.disabled = !agent.hero; kind.append(option);
  }
  launch.append(partyField(tr("勇者の しゅるい", "Hero kind"), kind), partyField(tr("拠点の path", "Base path"), cwd));
  const update = () => {
    launch.hidden = recipient.value !== "new";
    pass.disabled = recipient.value === "new" ? !kind.selectedOptions[0] || kind.selectedOptions[0].disabled : !recipient.selectedOptions[0] || recipient.selectedOptions[0].disabled;
  };
  recipient.onchange = update; kind.onchange = update;
  const writer = document.createElement("input"); writer.type = "checkbox";
  const prefix = `quests/${encodeURIComponent(quest.id)}`;
  const run = (action: () => Promise<void>) => { void action().catch((error: Error) => { status.textContent = error.message; }); };
  const append = partyButton(tr("▶ 最後の へんじを 差しこむ", "▶ Insert last reply"), () => run(async () => {
    const reply: string | undefined = controls?.mock ? quest.events.find((event) => event.kind === "report")?.text : (await partyRequest(`${prefix}/scroll`)).reply;
    if (!reply) { status.textContent = tr("返事は まだ とどいていない", "No reply has arrived yet"); return; }
    draft.value += `\n\n${reply}`; draft.dispatchEvent(new Event("input"));
  }));
  const summary = partyButton(tr("▶ まとめを たのむ", "▶ Ask for a summary"), () => {
      const text = summaryRequest(language);
      // The chosen template is visible before it is sent; no inferred request is made.
      if (!confirm(`${text}\n\n${tr("これを つたえる？", "Send this?")}`)) return;
      run(async () => { if (!controls?.mock) await partyRequest(`${prefix}/summary`, "POST", { text }); status.textContent = tr("まとめを たのんだ", "Summary requested"); });
    });
  const owner = members.find((member) => member.writer) ?? members.find((member) => member.session === quest.session);
  summary.disabled = !owner?.active || !owner.canTalk;
  const pass = partyButton(tr("▶ わたす", "▶ Pass scroll"), () => run(async () => {
      // The ledger only records the role; it never stops the old writer, so a busy one is named first.
      const writing = members.find((member) => member.writer);
      if (writer.checked && writing && writing.session !== recipient.value && writing.active && writing.waiting === false
        && !confirm(tr(`いまの かきかえる役（${writing.name}）は まだ 作業中。とめずに 役だけ うつす？`,
          `The current writer (${writing.name}) is still working. Move the role without stopping them?`))) return;
      const result: { delivered?: boolean } = controls?.mock ? { delivered: true } : await partyRequest(`${prefix}/handoff`, "POST", { text: draft.value, writer: writer.checked,
        ...(recipient.value === "new" ? { preset: kind.value, cwd: cwd.value } : { session: recipient.value }) });
      drafts.delete(quest.id); root.closest<HTMLElement>(".quest-party")!.dataset.dirty = "true";
      // Delivered means typed into the terminal, not that the hero has started the work.
      status.textContent = result.delivered ? tr("引き継ぎのメモを 届けた。読みはじめたかは 勇者の ようすで たしかめて", "Handoff note delivered. Watch the hero to see that it starts.")
        : tr("引き継ぎのメモを あずけた。いまの 作業が おわったら 届く", "Handoff note held. It will be delivered when the hero finishes its current work.");
    }));
  root.append(partyField(tr("引き継ぎのメモ（巻物）· 下書き", "Handoff note (scroll) · Draft"), draft), summary, append,
    partyField(tr("わたす 勇者", "Recipient"), recipient), launch,
    partyField(tr("かきかえる役を うつす", "Transfer writing role"), writer), pass);
  update();
  return root;
}
