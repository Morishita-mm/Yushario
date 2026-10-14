// Public launch capabilities, supplied by the server's single agent table.
import { tr } from "../language";
export type AgentInfo = { id: string; label: string; hero: boolean; resume: boolean; compact: boolean;
  equipWeapon: boolean; equipAccessory: boolean };

export async function loadAgents(): Promise<AgentInfo[]> {
  const token = new URLSearchParams(location.search).get("token") ?? "";
  const response = await fetch(`/api/agents?${new URLSearchParams({ token })}`, { cache: "no-store" });
  if (!response.ok) throw new Error(tr("勇者の 種類を よみこめませんでした。もういちど おためしください。", "Could not load hero kinds. Try again."));
  return response.json() as Promise<AgentInfo[]>;
}
