// Public launch capabilities, supplied by the server's single agent table.
export type AgentInfo = { id: string; label: string; hero: boolean; resume: boolean; compact: boolean };

export async function loadAgents(): Promise<AgentInfo[]> {
  const token = new URLSearchParams(location.search).get("token") ?? "";
  const response = await fetch(`/api/agents?${new URLSearchParams({ token })}`, { cache: "no-store" });
  if (!response.ok) throw new Error("勇者の 種類を よみこめませんでした。もういちど おためしください。");
  return response.json() as Promise<AgentInfo[]>;
}

export function supportText(agent: AgentInfo): string {
  if (!agent.hero) return `ターミナルのみ（勇者は 出ません）。${agent.id === "shell" ? "シェルを 操作できます。" : "町・会話への 自動連携は ありません。"}`;
  return `町・会話に 対応。やすむ（会話の 整理）：${agent.compact ? "対応" : "非対応"}。よびもどす（再開）：${agent.resume ? "対応" : "非対応"}。`;
}
