import type { Room } from "../../core/room";
import { roleIntroduction, roleLabel, type PartyRole } from "../../core/party";
import type { Notice } from "../town/herald";
import { partyButton, partyField, partyRequest, type PartyHero } from "../town/quest-party";
import { language, tr } from "../language";
import { coverMap } from "./talk";

type Invitation = { id: string; quest: string; town: string; from: string; session?: string; role: PartyRole; note: string; preset?: string; cwd?: string; at: number };
type Warning = { id: string; quest: string; town: string; hero: string; at: number; count?: number };
let invitations: Invitation[] = [], warnings: Warning[] = [];
export function setPartyNotices(value: { invitations?: Invitation[]; warnings?: Warning[] }): void { invitations = value.invitations ?? []; warnings = value.warnings ?? []; }
export function partyNotices(room: Room, names: Map<string, string>): Notice[] {
  const name = (id: string) => names.get(id) ?? room.agents.get(id)?.name ?? [...room.agents.values()].find((agent) => agent.terminal === id)?.name ?? id;
  return [...invitations.map((invite): Notice => ({ kind: "party-invite", id: invite.id, repo: invite.town, at: invite.at,
    text: tr(`しき ${name(invite.from)}が 仲間を よびたい · ${roleLabel(invite.role, language)}`, `Commander ${name(invite.from)} wants a hero · ${roleLabel(invite.role, language)}`), ago: tr("たしかめて", "Confirm") })),
  ...warnings.map((warning): Notice => ({ kind: "outside-role", id: warning.id, repo: warning.town, hero: warning.hero, at: warning.at,
    text: tr(`${name(warning.hero)}が やくわりの そとで ファイルを かえた`, `${name(warning.hero)} changed files outside their role`) + ((warning.count ?? 1) > 1 ? tr(` · ${warning.count}件 · クエストで みる`, ` · ${warning.count} warnings · View quest`) : ""), ago: "" }))];
}
export function pickPartyNotice(notice: Notice, openQuest: (id: string) => Promise<void>): boolean {
  if (notice.kind !== "party-invite" && notice.kind !== "outside-role") return false;
  const invitation = invitations.find((item) => item.id === notice.id), warning = warnings.find((item) => item.id === notice.id);
  if (!invitation && !warning) return true;
  const dialog = document.createElement("dialog"); dialog.className = "report-window party-confirmation";
  const heading = document.createElement("h3"); heading.textContent = notice.text;
  heading.id = `party-notice-title-${crypto.randomUUID()}`; dialog.setAttribute("aria-labelledby", heading.id);
  const resize = () => { if (dialog.open) coverMap(dialog); };
  window.addEventListener("resize", resize);
  dialog.addEventListener("close", () => { window.removeEventListener("resize", resize); dialog.remove(); }, { once: true });
  const status = document.createElement("p"); status.setAttribute("role", "status"); dialog.append(heading, status);
  const close = () => { dialog.close(); dialog.remove(); };
  const run = (action: () => Promise<void>) => { void action().catch((error: Error) => { status.textContent = error.message; }); };
  if (invitation) {
    const details = document.createElement("pre"); details.textContent = `${roleLabel(invitation.role, language)} · ${invitation.session ?? invitation.preset ?? ""}\n${invitation.cwd ?? ""}\n${invitation.note}`; dialog.append(details);
    const yes = partyButton(tr("▶ はい", "▶ Yes"), () => run(async () => {
      yes.disabled = no.disabled = true;
      const result = await partyRequest(`party-notices/${invitation.id}`, "POST", { yes: true });
      const members: PartyHero[] = await partyRequest(`quests/${invitation.quest}/party`);
      const member = members.find((item) => item.session === result.session?.id);
      if (!member) { close(); return; }
      const draft = document.createElement("textarea"); draft.rows = 7; draft.maxLength = 8000; draft.value = roleIntroduction(member, language);
      yes.remove(); no.remove();
      dialog.append(partyField(tr("やくわりの 紹介文 · 下書き", "Role introduction · Draft"), draft),
        partyButton(tr("▶ これを つたえる", "▶ Send this"), () => run(async () => { await partyRequest(`quests/${invitation.quest}/send`, "POST", { session: member.session, text: draft.value }); close(); })),
        partyButton(tr("▶ 送らない", "▶ Don't send"), close));
      status.textContent = tr("仲間が くわわった！", "Hero joined!");
    }));
    const no = partyButton(tr("▶ いいえ", "▶ No"), () => run(async () => { await partyRequest(`party-notices/${invitation.id}`, "POST", { yes: false }); close(); })); dialog.append(yes, no);
  } else if (warning) {
    dialog.append(partyButton(tr("▶ クエストを みる", "▶ View quest"), () => { close(); void openQuest(warning.quest); }),
      partyButton(tr("▶ たしかめた", "▶ Seen"), () => run(async () => { await partyRequest(`party-notices/${encodeURIComponent(warning.id)}`, "DELETE", {}); close(); })));
  }
  dialog.append(partyButton(tr("▶ とじる", "▶ Close"), close));
  dialog.addEventListener("keydown", (event) => event.stopPropagation()); document.body.append(dialog); coverMap(dialog); dialog.showModal(); return true;
}
