import type { HeroPlace, TownHero } from "../../core/town";
import type { Sheets } from "../town/sheets";
import { churchSlots } from "../town/church";
import { innSlots } from "../town/inn";
import type { Walker } from "../town/walkers";
import { latestReport, unreadReports } from "./read-reports";
import { REPORT_FRAME } from "./report-card";

export function reportSigns(art: Sheets, heroes: TownHero[], walkers: Walker[], place: "world" | HeroPlace) {
  // Fields are battles: a floating report would sit over the fight until the next request.
  if (place !== "town" && place !== "inn" && place !== "church") return [];
  const local = heroes.filter((hero) => hero.place === place);
  const beds = innSlots(art), prayers = churchSlots(art), inn = art.entry("inn-wall").inn!;
  return local.flatMap((hero, index) => {
    const unread = unreadReports(hero.agent), reply = latestReport(hero.agent) ?? unread[unread.length - 1];
    if (!reply) return [];
    const walker = walkers.find((item) => item.id === hero.id);
    const at = place === "town" ? walker && [walker.x, walker.y - 60]
      : place === "inn" ? index < beds.length && [beds[index][0] + inn.report[0], beds[index][1] + inn.report[1]]
        : index < prayers.length && [prayers[index][0], prayers[index][1] - 60];
    if (!at) return [];
    return [{ id: hero.id, at: unread[unread.length - 1]?.at ?? reply.at,
      x: at[0], y: at[1], unread: Boolean(unread.length), frame: REPORT_FRAME[reply.report?.kind ?? "talk"] }];
  });
}

export function drawReportSigns(ctx: CanvasRenderingContext2D, art: Sheets, time: number,
  signs: ReturnType<typeof reportSigns>): void {
  for (const sign of signs) {
    const wobble = sign.unread ? Math.sin(time / 140) * 3 : 0;
    art.draw(ctx, "ui-report", sign.frame, sign.x, sign.y + wobble, false, 0.65);
    if (sign.unread) art.draw(ctx, "ui-balloons", "exclamation", sign.x + 14, sign.y - 13 + wobble, false, 0.85);
  }
}
