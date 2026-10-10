import type { TownRecord, TownSettings as Settings, TownTheme } from "../../core/town-ledger";

export type { TownRecord, Settings };
export type TownChange = { theme?: TownTheme; pinned?: boolean; archived?: false };

const token = new URLSearchParams(location.search).get("token") ?? "";

async function request(path: string, method = "GET", body?: TownChange | Settings): Promise<Response> {
  const response = await fetch(`${path}?token=${encodeURIComponent(token)}`, {
    method, cache: "no-store",
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`町の台帳に つながりませんでした（${response.status}）`);
  return response;
}

export async function loadTowns(): Promise<TownRecord[]> {
  return (await request("/api/towns")).json() as Promise<TownRecord[]>;
}
export async function patchTown(name: string, change: TownChange): Promise<TownRecord> {
  return (await request(`/api/towns/${encodeURIComponent(name)}`, "PATCH", change)).json() as Promise<TownRecord>;
}
export async function loadSettings(): Promise<Settings> {
  return (await request("/api/settings")).json() as Promise<Settings>;
}
export async function saveSettings(settings: Settings): Promise<void> {
  await request("/api/settings", "PUT", settings);
}
