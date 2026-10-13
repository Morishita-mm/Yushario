import type { AgentEvent } from "./events";
import type { SoundMode } from "./town-ledger";

export type NotificationSound = "permission" | "report" | "failure" | "level-up";
export type SoundNotice =
  | { type: "event"; event: AgentEvent; levelUp: boolean; ended: boolean }
  | { type: "permission"; id: string; agent?: string }
  | { type: "attention"; reason: string };
export type PlayedSounds = Partial<Record<NotificationSound, number>>;

export function notificationSound(
  notice: SoundNotice, live: boolean, seenPermissions: ReadonlySet<string>, mode: SoundMode,
  followedId: string | undefined,
): NotificationSound | undefined {
  if (!live || mode === "off") return;
  if (notice.type === "permission") return seenPermissions.has(notice.id) ? undefined : "permission";
  if (notice.type === "attention") return notice.reason === "trust" ? "permission" : undefined;
  // Room and Following use the parent event.agent (or "default"), not subagent.id or terminal.
  if (mode === "follow" && (followedId === undefined || (notice.event.agent ?? "default") !== followedId)) return;
  // SessionEnd may have no terminal; late hooks must stay silent even if Room recreates the hero.
  if (notice.ended) return;
  // The same event that puts the level-up message on the town banner gets only one sound.
  if (notice.levelUp) return "level-up";
  if (notice.event.subagent) return;
  if (notice.event.hook === "Stop") return "report";
  if (notice.event.hook === "StopFailure") return "failure";
}

export function canPlaySound(
  sound: NotificationSound, played: PlayedSounds, now: number, enabled: boolean, ready: boolean,
): boolean {
  const previous = played[sound];
  return enabled && ready && (previous === undefined || now - previous >= 2000);
}
