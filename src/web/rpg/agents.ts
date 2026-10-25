// Public launch capabilities, supplied by the server's single agent table.
import { tr } from "../language";
export type AgentInfo = { id: string; label: string; hero: boolean; resume: boolean; compact: boolean;
  equipWeapon: boolean; equipAccessory: boolean };

export function codexNotice(): string {
  return tr("Codex 0.164.0：/hooks で Yushario のフックを確認。許可への返事は ターミナルから。道具の成否・合格条件の証拠・MP は取得できない。",
    "Codex 0.164.0: review Yushario hooks in /hooks. Answer approvals in the terminal. Tool results, check evidence and MP are unavailable.");
}

export async function loadAgents(): Promise<AgentInfo[]> {
  const token = new URLSearchParams(location.search).get("token") ?? "";
  const response = await fetch(`/api/agents?${new URLSearchParams({ token })}`, { cache: "no-store" });
  if (!response.ok) throw new Error(tr("勇者の種類を 読み込めなかった。もう一度ためそう。", "Could not load hero kinds. Try again."));
  return response.json() as Promise<AgentInfo[]>;
}
