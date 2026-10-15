import type { RoomAgent } from "../../core/room";
import { tr } from "../language";

export function interruptStatus(agent: RoomAgent, now: number): string | undefined {
  if (agent.stopRequestedAt === undefined) return;
  return now - agent.stopRequestedAt >= 30_000
    ? tr("まだ とまったか わからない。ターミナルで たしかめて。", "Stop not confirmed. Check the terminal.")
    : tr("とめるよう たのんだ。しらせを まっている…", "Asked to stop. Awaiting word…");
}
