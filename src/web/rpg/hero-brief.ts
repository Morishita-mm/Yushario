import type { RoomAgent } from "../../core/room";
import { tr } from "../language";
import { codexNotice } from "./agents";
import { DOING, element } from "./status-card";
import { interruptStatus } from "./interrupt-status";

// The chosen hero, opened in place in the hero list (docs/PLATFORM.md stage 25): only what helps act now.
// Mood, party, tasks and the full log stay in the strength window ("More").
export type BriefActions = { talk?: () => void; terminal?: () => void; review?: () => void; details: () => void };
export function heroBrief(agent: RoomAgent, now: number, gear: string | undefined, permission: HTMLElement | undefined, actions: BriefActions): HTMLElement {
  const box = element("div", "hero-brief"); box.dataset.agent = agent.id;
  const seconds = Math.max(0, Math.floor((now - agent.since) / 1000));
  const doing = interruptStatus(agent, now) ?? DOING[agent.activity](agent.target ?? "");
  box.append(element("p", "doing", tr(`▶ ${doing}（${Math.floor(seconds / 60)}分）`, `▶ ${doing} (${Math.floor(seconds / 60)}m)`)));
  box.append(element("p", "hero-brief-gear", [gear, agent.branch ? `⑂ ${agent.branch}` : ""].filter(Boolean).join(" · ")));
  if (agent.source === "codex") box.append(element("p", "hint", codexNotice()));
  if (permission) box.append(permission);
  const row = element("div", "actions");
  const button = (text: string, run: () => void) => {
    const node = element("button", undefined, text); node.type = "button";
    node.addEventListener("click", (event) => { event.stopPropagation(); run(); }); row.append(node);
  };
  if (actions.talk) button(tr("▶ はなす", "▶ Talk"), actions.talk);
  if (actions.terminal) button(tr("▶ ターミナル", "▶ Terminal"), actions.terminal);
  if (actions.review) button(tr("▶ かんてい", "▶ Review"), actions.review);
  button(tr("▶ くわしく", "▶ More"), actions.details);
  if (!agent.terminal) box.append(element("p", "hint", tr("外から来た 勇者", "Visiting hero")));
  box.append(row);
  return box;
}
