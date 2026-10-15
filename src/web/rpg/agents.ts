// Public launch capabilities, supplied by the server's single agent table.
import { tr } from "../language";
export type AgentInfo = { id: string; label: string; hero: boolean; resume: boolean; compact: boolean;
  equipWeapon: boolean; equipAccessory: boolean };

export function codexNotice(): string {
  return tr("Codex 0.162.1：/hooks で Yushario のフックを たしかめ、最初の依頼は ターミナルから。許可も ターミナルで こたえる。道具の成否・合格条件の証拠・MPは 取れません。",
    "Codex 0.162.1: review Yushario hooks in /hooks; send the first request in the terminal. Answer approvals there too. Tool results, check evidence and MP are unavailable.");
}

export async function loadAgents(): Promise<AgentInfo[]> {
  const token = new URLSearchParams(location.search).get("token") ?? "";
  const response = await fetch(`/api/agents?${new URLSearchParams({ token })}`, { cache: "no-store" });
  if (!response.ok) throw new Error(tr("勇者の 種類を よみこめませんでした。もういちど おためしください。", "Could not load hero kinds. Try again."));
  return response.json() as Promise<AgentInfo[]>;
}
