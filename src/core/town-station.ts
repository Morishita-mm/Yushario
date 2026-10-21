import type { Activity } from "./activity";
import type { RoomAgent } from "./room";
import type { RoadPoint } from "./walking";

export type PropStation = "fire" | "crystal" | "tower";
export type TownStation = PropStation | "library" | "shop";
export const STATION_HOLD_MS = 8_000;
export const TOWN_WANDER_STOPS = ["plazaW", "plazaE", "well", "bridge", "homeE"] as const;
const ACTIVITY_STATIONS: Partial<Record<Activity, TownStation>> = {
  think: "fire", git: "crystal", web: "tower", read: "library", search: "library", tool: "shop",
};
// Ground-level places around each outdoor endpoint. Interiors have their own slots in the art data.
export const STATION_SLOTS: Record<PropStation, readonly RoadPoint[]> = {
  fire: [[0, 0], [-24, 0], [24, 0], [0, 12]],
  crystal: [[0, 0], [-20, 8], [20, 8], [0, 24]],
  tower: [[0, 0], [14, -10], [-16, -8]],
};

type RecentActivity = Pick<RoomAgent, "activity" | "activityAt" | "log">;
// One retention rule for both outdoor props and interiors. Keep the library's last reading/search pose too.
export function stationActivity(agent: RecentActivity, now: number): Activity | undefined {
  if (agent.activityAt <= now && ACTIVITY_STATIONS[agent.activity]) return agent.activity;
  let latest: { at: number; activity: Activity } | undefined;
  for (const entry of agent.log) {
    if (ACTIVITY_STATIONS[entry.activity] && entry.at <= now && (!latest || entry.at >= latest.at)) latest = entry;
  }
  return latest && now - latest.at < STATION_HOLD_MS ? latest.activity : undefined;
}

export function townStation(agent: RecentActivity, now: number): TownStation | undefined {
  const activity = stationActivity(agent, now);
  return activity && ACTIVITY_STATIONS[activity];
}
