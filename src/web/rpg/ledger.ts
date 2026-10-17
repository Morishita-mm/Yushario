import { tr } from "../language";
import type { TownRecord, TownSettings as Settings, TownTheme } from "../../core/town-ledger";

export type { TownRecord, Settings };
export type TownChange = { theme?: TownTheme; pinned?: boolean; archived?: false };

const token = new URLSearchParams(location.search).get("token") ?? "";

async function request(path: string, method = "GET", body?: TownChange | Settings): Promise<Response> {
  const response = await fetch(`${path}?token=${encodeURIComponent(token)}`, {
    method, cache: "no-store",
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(tr(`町の台帳に つながらなかった（${response.status}）`, `Could not reach the town ledger (${response.status})`));
  return response;
}

export async function loadTowns(): Promise<TownRecord[]> {
  return (await request("/api/towns")).json() as Promise<TownRecord[]>;
}
export async function patchTown(name: string, change: TownChange): Promise<TownRecord> {
  return (await request(`/api/towns/${encodeURIComponent(name)}`, "PATCH", change)).json() as Promise<TownRecord>;
}
export async function loadSettings(): Promise<Settings & { startupCwd: string }> {
  return (await request("/api/settings")).json() as Promise<Settings & { startupCwd: string }>;
}
let settingsSave = Promise.resolve();
export function saveSettings(change: Partial<Settings>): Promise<void> {
  // Read after the previous save to preserve all other choices.
  const saving = settingsSave.then(async () => {
    const { archiveAfterDays, sound, language, saveConversation = false } = await loadSettings();
    await request("/api/settings", "PUT", { archiveAfterDays, sound, language, saveConversation, ...change });
  });
  settingsSave = saving.catch(() => undefined);
  return saving;
}
