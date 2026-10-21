import { describe, expect, it } from "vitest";
import { Room } from "./room";
import type { Activity } from "./activity";
import { STATION_HOLD_MS, TOWN_WANDER_STOPS, stationActivity, townStation } from "./town-station";

const agent = (activity: Activity, at = 1000) => ({ activity, activityAt: at, log: [{ activity, at }] });

describe("town activity stations", () => {
  it("keeps ongoing thinking, recording and web research at their own prop, including long journeys", () => {
    for (const [activity, station] of [["think", "fire"], ["git", "crystal"], ["web", "tower"], ["read", "library"], ["search", "library"], ["tool", "shop"]] as const) {
      expect(townStation(agent(activity), 1000)).toBe(station);
      expect(townStation(agent(activity), 90_000)).toBe(station);
    }
  });
  it("gives all other activities no dedicated prop (especially the CLI's plan)", () => {
    for (const activity of ["idle", "plan", "ask", "edit", "test", "run", "delegate", "rest"] as const) {
      expect(townStation(agent(activity), 1000)).toBeUndefined();
    }
  });
  it("never sends wandering heroes to an activity prop or building", () => {
    expect(TOWN_WANDER_STOPS).toEqual(["plazaW", "plazaE", "well", "bridge", "homeE"]);
    for (const stop of ["library", "shop", "fire", "crystal", "tower", "board"]) expect(TOWN_WANDER_STOPS).not.toContain(stop);
  });
  it("retains the library's search pose during the same grace period", () => {
    const recent = { ...agent("plan", 2000), log: [{ activity: "search" as const, at: 1000 }] };
    expect(townStation(recent, 8999)).toBe("library");
    expect(stationActivity(recent, 8999)).toBe("search");
    expect(stationActivity(recent, 9000)).toBeUndefined();
  });
  it("holds through short unrelated activity, then expires exactly eight seconds after the last match", () => {
    const recent = { ...agent("plan", 2000), log: [{ activity: "think" as const, at: 1000 }, { activity: "plan" as const, at: 2000 }] };
    expect(townStation(recent, 1000 + STATION_HOLD_MS - 1)).toBe("fire");
    expect(townStation(recent, 1000 + STATION_HOLD_MS)).toBeUndefined();
    expect(townStation(recent, 100_000)).toBeUndefined();
  });
  it("switches immediately on a different station activity and does not renew a hold for unrelated events", () => {
    const room = new Room();
    room.apply({ state: "thinking", hook: "UserPromptSubmit" }, 1000);
    room.apply({ state: "working", hook: "PreToolUse", tool: "Bash", target: "git status" }, 2000);
    const hero = room.agents.get("default")!;
    expect(townStation(hero, 2000)).toBe("crystal");
    room.apply({ state: "working", hook: "PreToolUse", tool: "WebSearch" }, 3000);
    expect(townStation(hero, 3000)).toBe("tower");
    room.apply({ state: "idle", hook: "Stop" }, 4000);
    room.apply({ state: "working", hook: "PreToolUse", tool: "TaskUpdate" }, 9000);
    expect(townStation(hero, 10_999)).toBe("tower");
    expect(townStation(hero, 11_000)).toBeUndefined();
  });
  it("renews the grace period on a repeated thinking event, not just the first activity change", () => {
    const room = new Room();
    room.apply({ state: "thinking", hook: "UserPromptSubmit" }, 1000);
    room.apply({ state: "thinking", hook: "Notification" }, 7000);
    room.apply({ state: "working", hook: "PreToolUse", tool: "TaskUpdate" }, 8000);
    const hero = room.agents.get("default")!;
    expect(townStation(hero, 14_999)).toBe("fire");
    expect(townStation(hero, 15_000)).toBeUndefined();
  });
  it("ignores future entries and picks event time, not arrival order, without mutating history", () => {
    const recent = { ...agent("idle"), log: [{ activity: "git" as const, at: 2000 }, { activity: "think" as const, at: 1000 }, { activity: "web" as const, at: 4000 }] };
    const before = structuredClone(recent);
    expect(townStation(recent, 3000)).toBe("crystal");
    expect(townStation(recent, 500)).toBeUndefined();
    expect(recent).toEqual(before);
  });
});
