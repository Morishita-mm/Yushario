import { handoffScroll, summaryRequest } from "../../core/party-scroll";
import { checkMark } from "../../core/checks";
import type { QuestDetail } from "../../core/quests";
import { language, tr } from "../language";
import type { Session } from "../terminal";
import { partyButton, partyField, partyRequest, type PartyControls, type PartyHero } from "./quest-party";

const drafts = new Map<string, string>();
export function questHandoff(quest: QuestDetail, members: PartyHero[], sessions: Session[], controls: PartyControls | undefined, status: HTMLElement): HTMLElement {
  const root = document.createElement("details"); root.className = "quest-handoff";
  const heading = document.createElement("summary"); heading.textContent = tr("▶ ひきつぎ", "▶ Handoff"); root.append(heading);
  root.addEventListener("toggle", () => { if (root.open) root.closest<HTMLElement>(".quest-party")!.dataset.dirty = "true"; });
  const draft = document.createElement("textarea"); draft.rows = 12; draft.maxLength = 8000;
  draft.value = drafts.get(quest.id) ?? handoffScroll(quest, quest.checks?.map((check) => ({ title: check.name, mark: checkMark(check.evidence, quest.fingerprint) })) ?? [], language);
  draft.oninput = () => { drafts.set(quest.id, draft.value); root.closest<HTMLElement>(".quest-party")!.dataset.dirty = "true"; };
  const recipient = document.createElement("select");
  for (const session of sessions.filter((item) => item.project === quest.town && !item.exited && members.find((member) => member.session === item.id)?.active !== false)) recipient.append(new Option(`${members.find((member) => member.session === session.id)?.name ?? session.preset} · ${session.id}`, session.id));
  if (controls?.mock) for (const member of members) recipient.append(new Option(member.name, member.session));
  recipient.append(new Option(tr("あたらしく 出陣", "Embark a new hero"), "new"));
  const launch = document.createElement("div"), kind = document.createElement("select"), cwd = document.createElement("input"); launch.hidden = true; cwd.value = quest.worktreePath ?? "";
  for (const preset of ["claude", "pi", "codex", "shell"]) kind.append(new Option(preset, preset));
  if (!controls?.mock) void partyRequest("agents").then((agents: { id: string }[]) => {
    kind.replaceChildren(); for (const agent of agents) kind.append(new Option(agent.id, agent.id));
  }).catch(() => undefined);
  launch.append(partyField(tr("勇者の しゅるい", "Hero kind"), kind), partyField(tr("拠点の path", "Base path"), cwd));
  recipient.onchange = () => { launch.hidden = recipient.value !== "new"; };
  const writer = document.createElement("input"); writer.type = "checkbox";
  const prefix = `quests/${encodeURIComponent(quest.id)}`;
  const run = (action: () => Promise<void>) => { void action().catch((error: Error) => { status.textContent = error.message; }); };
  const append = partyButton(tr("▶ 最後の へんじを 差しこむ", "▶ Insert last reply"), () => run(async () => {
    const reply: string | undefined = controls?.mock ? quest.events.find((event) => event.kind === "report")?.text : (await partyRequest(`${prefix}/scroll`)).reply;
    if (!reply) { status.textContent = tr("返事は まだ とどいていない", "No reply has arrived yet"); return; }
    draft.value += `\n\n${reply}`; draft.dispatchEvent(new Event("input"));
  }));
  root.append(partyField(tr("巻物 · 下書き", "Scroll · Draft"), draft),
    partyButton(tr("▶ まとめを たのむ", "▶ Ask for a summary"), () => {
      const text = summaryRequest(language);
      // The chosen template is visible before it is sent; no inferred request is made.
      if (!confirm(`${text}\n\n${tr("これを つたえる？", "Send this?")}`)) return;
      run(async () => { if (!controls?.mock) await partyRequest(`${prefix}/summary`, "POST", {}); status.textContent = tr("まとめを たのんだ", "Summary requested"); });
    }), append, partyField(tr("わたす 勇者", "Recipient"), recipient), launch,
    partyField(tr("かきかえる役を うつす", "Transfer writing role"), writer),
    partyButton(tr("▶ わたす", "▶ Pass scroll"), () => run(async () => {
      if (!controls?.mock) await partyRequest(`${prefix}/handoff`, "POST", { text: draft.value, writer: writer.checked,
        ...(recipient.value === "new" ? { preset: kind.value, cwd: cwd.value } : { session: recipient.value }) });
      drafts.delete(quest.id); root.closest<HTMLElement>(".quest-party")!.dataset.dirty = "true"; status.textContent = tr("巻物を わたした！", "Scroll passed!");
    })));
  return root;
}
