import { describe, expect, it } from "vitest";
import { canPlaySound, notificationSound as chooseSound, rememberPermissionSound, type NotificationSound, type SoundNotice } from "./notification-sound";
import type { SoundMode } from "./town-ledger";

function notificationSound(notice: SoundNotice, live: boolean, seen: ReadonlySet<string>,
  mode: SoundMode = "all", followedId?: string): NotificationSound | undefined {
  return chooseSound(notice, live, seen, mode, followedId);
}

const unseen = new Set<string>();
const stop: SoundNotice = { type: "event", event: { state: "success", hook: "Stop" }, levelUp: false, ended: false };
const failure: SoundNotice = { type: "event", event: { state: "error", hook: "StopFailure" }, levelUp: false, ended: false };
const permission: SoundNotice = { type: "permission", id: "request-1" };
const trust: SoundNotice = { type: "attention", reason: "trust" };
const levelUp: SoundNotice = { ...stop, levelUp: true };

describe("notification sounds", () => {
  it("selects only the four notification sounds", () => {
    for (const [notice, sound] of [[stop, "report"], [failure, "failure"], [permission, "permission"],
      [trust, "permission"], [levelUp, "level-up"]] as const) {
      expect(notificationSound(notice, true, unseen)).toBe(sound);
    }
    expect(notificationSound({ type: "attention", reason: "other" }, true, unseen)).toBeUndefined();
    for (const hook of ["SessionStart", "SessionEnd", "PreToolUse", "PostToolUse", "PostToolUseFailure",
      "UserPromptSubmit", "PermissionRequest", "Notification", "SubagentStop"]) {
      expect(notificationSound({ type: "event", event: { state: "working", hook }, levelUp: false, ended: false }, true, unseen))
        .toBeUndefined();
    }
  });

  it("never rings for a replay or reconnect snapshot", () => {
    for (const notice of [stop, failure, permission, trust, levelUp]) {
      expect(notificationSound(notice, false, unseen)).toBeUndefined();
    }
  });

  it("does not ring again for the same permission id, even after resolution or reconnect", () => {
    const seen = new Set([permission.id]);
    expect(notificationSound(permission, true, seen)).toBeUndefined();
    expect(notificationSound({ type: "permission", id: "request-2" }, true, seen)).toBe("permission");
    expect([...seen]).toEqual([permission.id]);
  });

  it("bounds remembered permission IDs while keeping recent and replayed requests silent", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) rememberPermissionSound(seen, String(i));
    expect(seen.size).toBe(256);
    expect(seen.has('0')).toBe(false);
    expect(notificationSound({ type: 'permission', id: '999' }, true, seen)).toBeUndefined();
    rememberPermissionSound(seen, '744'); rememberPermissionSound(seen, 'new');
    expect(seen.has('744')).toBe(true);
    expect(seen.has('745')).toBe(false);
    expect(seen.size).toBe(256);
  });

  it("ignores subagent Stop and StopFailure", () => {
    for (const notice of [stop, failure]) {
      expect(notificationSound({ ...notice, event: { ...notice.event, subagent: { id: "helper" } } }, true, unseen))
        .toBeUndefined();
    }
  });

  it("ignores a late level-up from an ended conversation", () => {
    const late: SoundNotice = { type: "event", event: { state: "success", hook: "TaskCompleted", agent: "old" }, levelUp: true, ended: true };
    expect(notificationSound(late, true, unseen)).toBeUndefined();
  });

  it("ignores late Stop and StopFailure from ended conversations, with or without a terminal", () => {
    for (const notice of [stop, failure]) {
      for (const terminal of [undefined, "shared-pty"]) {
        for (const levelUp of [false, true]) {
          const late = { ...notice, event: { ...notice.event, agent: "old", terminal }, levelUp, ended: true };
          expect(notificationSound(late, true, unseen)).toBeUndefined();
          expect(notificationSound(late, true, unseen)).toBeUndefined(); // Repeated late hooks stay silent.
          expect(notificationSound({ ...late, ended: false }, true, unseen))
            .toBe(levelUp ? "level-up" : notice === stop ? "report" : "failure");
        }
      }
    }
  });

  it("chooses level-up instead of report for the same event", () => {
    expect(notificationSound(levelUp, true, unseen)).toBe("level-up");
    expect(notificationSound({ ...stop, event: { state: "working", hook: "PostToolUse" }, levelUp: true }, true, unseen))
      .toBe("level-up");
  });

  it("in follow mode rings for everyone's permissions and trust, even with no followed hero", () => {
    for (const followedId of [undefined, "hero"]) {
      for (const agent of [undefined, "hero", "other"]) {
        expect(notificationSound({ ...permission, agent }, true, unseen, "follow", followedId)).toBe("permission");
      }
      expect(notificationSound(trust, true, unseen, "follow", followedId)).toBe("permission");
      expect(notificationSound(permission, true, new Set([permission.id]), "follow", followedId)).toBeUndefined();
    }
  });

  it("in follow mode only rings for the followed hero's report, failure or banner level-up", () => {
    for (const notice of [stop, failure, levelUp]) {
      for (const agent of ["hero", "other"]) {
        const event = { ...notice, event: { ...notice.event, agent } };
        const sound = notice.levelUp ? "level-up" : notice === stop ? "report" : "failure";
        expect(notificationSound(event, true, unseen, "follow", "hero")).toBe(agent === "hero" ? sound : undefined);
        expect(notificationSound(event, true, unseen, "follow")).toBeUndefined();
        expect(notificationSound(event, true, unseen, "all")).toBe(sound);
        expect(notificationSound({ ...event, ended: true }, true, unseen, "follow", "hero")).toBeUndefined();
      }
    }
  });

  it("matches Room/Following IDs, including the default hero and a parent's subagent level-up", () => {
    expect(notificationSound(stop, true, unseen, "follow", "default")).toBe("report");
    const helper: SoundNotice = { ...levelUp,
      event: { state: "working", hook: "PostToolUse", agent: "hero", terminal: "pty", subagent: { id: "helper" } } };
    expect(notificationSound(helper, true, unseen, "follow", "hero")).toBe("level-up");
    for (const followedId of [undefined, "helper", "pty", "other"]) {
      expect(notificationSound(helper, true, unseen, "follow", followedId)).toBeUndefined();
    }
    expect(notificationSound({ ...helper, levelUp: false }, true, unseen, "follow", "hero")).toBeUndefined();
  });

  it("keeps every mode silent for replay, and off silent for every live notice", () => {
    for (const notice of [stop, failure, permission, trust, levelUp]) {
      for (const mode of ["all", "follow", "off"] as const) {
        expect(notificationSound(notice, false, unseen, mode, "default")).toBeUndefined();
      }
      expect(notificationSound(notice, true, unseen, "off", "default")).toBeUndefined();
    }
  });

  it("requires both enabled sound and a running audio context, without queuing earlier events", () => {
    expect(canPlaySound("report", {}, 0, true, true)).toBe(true);
    expect(canPlaySound("report", {}, 0, false, true)).toBe(false);
    expect(canPlaySound("report", {}, 0, true, false)).toBe(false);
    expect(canPlaySound("report", {}, 0, false, false)).toBe(false);
  });

  it("limits each sound across all heroes to once per two seconds, including the boundary", () => {
    for (const sound of ["permission", "report", "failure", "level-up"] as NotificationSound[]) {
      const played = Object.freeze({ [sound]: 1000 });
      expect(canPlaySound(sound, played, 1000, true, true)).toBe(false);
      expect(canPlaySound(sound, played, 2999, true, true)).toBe(false);
      expect(canPlaySound(sound, played, 3000, true, true)).toBe(true);
      expect(canPlaySound(sound, played, 3001, true, true)).toBe(true);
      expect(canPlaySound(sound, played, 999, true, true)).toBe(false);
    }
    expect(canPlaySound("failure", { report: 1000 }, 1000, true, true)).toBe(true);
    expect(canPlaySound("report", { "level-up": 1000 }, 1000, true, true)).toBe(true);
  });
});
