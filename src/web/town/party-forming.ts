import type { PartyRole } from "../../core/party";
import type { QuestDetail } from "../../core/quests";
import type { QuestStage } from "../../core/quest-stage";
import type { Tactic } from "../../core/tactics";
import { tr } from "../language";
import { partyRequest, type PartyHero } from "./quest-party";

// How the party window behaves, from the quest's stage (docs/PLATFORM.md stage 26):
// before the request and after a report, the party is formed first and sets off together;
// while work is running, asking a helper sends at once; adopted or dropped quests are only shown.
export type PartyMode = "form" | "redo" | "live" | "view";
export function partyMode(stage: QuestStage): PartyMode {
  if (stage === "assign" || stage === "send") return "form";
  if (stage === "review") return "redo";
  return stage === "work" || stage === "waiting" ? "live" : "view";
}

// Kept per quest while forming, so closing the window loses nothing: the request text, what each helper
// will be asked, and whether the owner changed (then the new owner also gets the handoff note).
// `sent`: who already got their part in this set-off ("lead:<who>" for the request, so a new owner still gets it),
// so trying again sends only the rest. `noted`: asks only left with a tactic (not delivered yet), and for which tactic.
// `round`: the quest's latest report when this was formed. A new report starts a new round: what was sent before no
// longer counts, and the request is written again; asks that never went out stay waiting.
type Ask = { role: PartyRole; text: string };
type Forming = { round: number; request?: string; asks: Map<string, Ask>; ownerChanged: boolean; sent: Set<string>; noted: Map<string, Tactic> };
const forming = new Map<string, Forming>();
export function formingOf(quest: QuestDetail): Forming {
  const round = Math.max(0, ...quest.events.filter((event) => event.kind === "report").map((event) => event.id));
  let state = forming.get(quest.id);
  if (!state || state.round !== round) {
    // An ask left with a tactic went out only if the tactic started (the request was sent); otherwise it still waits.
    const started = [...(state?.sent ?? [])].some((key) => key.startsWith("lead:"));
    const waiting = [...(state?.asks ?? [])].filter(([session]) => !state!.sent.has(session) && !(started && state!.noted.has(session)));
    state = { round, asks: new Map(waiting), ownerChanged: false, sent: new Set(), noted: new Map() }; forming.set(quest.id, state);
  }
  return state;
}
// A changed or cancelled ask must go out again as written now, not as it was left with a tactic or sent before.
export function setAsk(state: Forming, session: string, ask?: Ask): boolean {
  state.sent.delete(session); state.noted.delete(session);
  if (ask) { state.asks.set(session, ask); return true; }
  return state.asks.delete(session);
}

// Everyone sets off at once. Under "review each other" and "research first" the helpers' asks ride on the
// tactic's own first message to them; otherwise they are sent now, with the request to the owner (or commander).
export async function setOff(quest: QuestDetail, request: string, tactic: Tactic | undefined, members: PartyHero[], name: (session: string) => string): Promise<void> {
  const prefix = `quests/${encodeURIComponent(quest.id)}`, state = formingOf(quest);
  // An ask is sent only to a helper still in the role it was written for; a hero made owner gets the owner's request instead.
  const helper = (session: string, role: PartyRole) => members.find((member) => member.session === session && member.active && !member.writer && member.role === role);
  const notes: Record<string, string> = {}, now: { session: string; text: string }[] = [];
  for (const [session, ask] of state.asks) {
    if (!helper(session, ask.role) || state.sent.has(session)) continue;
    if (tactic === "review" && ask.role === "review" || tactic === "research" && ask.role === "research") { if (state.noted.get(session) !== tactic) notes[session] = ask.text; }
    else now.push({ session, text: ask.text });
  }
  const done = () => [...state.sent].map((key) => key.startsWith("lead:") ? tr("依頼", "the request") : name(key));
  try {
    if (Object.keys(notes).length) { await partyRequest(`${prefix}/notes`, "POST", { notes }); for (const session of Object.keys(notes)) state.noted.set(session, tactic!); }
    const lead = tactic === "research" ? undefined : tactic === "delegate" ? members.find((member) => member.role === "command" && member.active) : members.find((member) => member.writer && member.active);
    const leadKey = `lead:${tactic === "research" ? "research" : lead?.session ?? ""}`;
    if (!state.sent.has(leadKey)) {
      if (tactic !== "research" && !lead) throw new Error(tactic === "delegate" ? tr("しき役が いない。先に しき役を 決める", "No commander yet") : tr("担当が いない。先に 担当を 決める", "No owner yet"));
      const first = state.ownerChanged ? `${(await partyRequest(`${prefix}/scroll`)).text}\n\n---\n\n${request}` : request;
      if (tactic === "research") await partyRequest(`${prefix}/research`, "POST", { text: first });
      else await partyRequest(`${prefix}/send`, "POST", { session: lead!.session, text: first });
      state.sent.add(leadKey);
    }
    for (const item of now) { await partyRequest(`${prefix}/send`, "POST", item); state.sent.add(item.session); }
  } catch (error) {
    const sent = done(), message = error instanceof Error ? error.message : String(error);
    throw new Error(sent.length ? tr(`${sent.join("・")}には 送った。残りで 失敗：${message}。もう一度 押すと 残りだけ 送る。`, `Sent to ${sent.join(", ")}. The rest failed: ${message}. Press again to send only the rest.`) : message);
  }
  forming.delete(quest.id);
}
