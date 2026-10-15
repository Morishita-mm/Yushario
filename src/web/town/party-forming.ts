import type { PartyRole } from "../../core/party";
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
type Forming = { request?: string; asks: Map<string, { role: PartyRole; text: string }>; ownerChanged: boolean };
const forming = new Map<string, Forming>();
export function formingOf(quest: string): Forming {
  let state = forming.get(quest);
  if (!state) { state = { asks: new Map(), ownerChanged: false }; forming.set(quest, state); }
  return state;
}

// Everyone sets off at once. Under "review each other" and "research first" the helpers' asks ride on the
// tactic's own first message to them; otherwise they are sent now, with the request to the owner (or commander).
export async function setOff(quest: string, request: string, tactic: Tactic | undefined, members: PartyHero[]): Promise<void> {
  const prefix = `quests/${encodeURIComponent(quest)}`, state = formingOf(quest);
  const active = (session: string) => members.find((member) => member.session === session && member.active);
  let first = request;
  if (state.ownerChanged) first = `${(await partyRequest(`${prefix}/scroll`)).text}\n\n---\n\n${request}`;
  const notes: Record<string, string> = {}, now: { session: string; text: string }[] = [];
  for (const [session, ask] of state.asks) {
    if (!active(session)) continue;
    if (tactic === "review" && ask.role === "review" || tactic === "research" && ask.role === "research") notes[session] = ask.text;
    else now.push({ session, text: ask.text });
  }
  if (Object.keys(notes).length) await partyRequest(`${prefix}/notes`, "POST", { notes });
  if (tactic === "research") await partyRequest(`${prefix}/research`, "POST", { text: first });
  else {
    const lead = tactic === "delegate" ? members.find((member) => member.role === "command" && member.active) : members.find((member) => member.writer && member.active);
    if (!lead) throw new Error(tactic === "delegate" ? tr("しき役が いない。先に しき役を 決める", "No commander yet") : tr("担当が いない。先に 担当を 決める", "No owner yet"));
    await partyRequest(`${prefix}/send`, "POST", { session: lead.session, text: first });
  }
  for (const item of now) await partyRequest(`${prefix}/send`, "POST", item);
  forming.delete(quest);
}
