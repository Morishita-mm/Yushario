import type { HeroPlace, TownHero } from "../../core/town";
import type { Sheets } from "../town/sheets";
import type { NoticeMarkFrame } from "../town/notice-mark";
import { churchSlots } from "../town/church";
import { innSlots } from "../town/inn";
import { LIBRARY_SCALE, libraryPositions } from "../town/library";
import { SHOP_SCALE, shopSlots } from "../town/shop";
import type { Walker } from "../town/walkers";
import { latestReport, unreadReports } from "./read-reports";
import { REPORT_FRAME } from "./report-card";

export function reportSigns(art: Sheets, heroes: TownHero[], walkers: Walker[], place: "world" | HeroPlace) {
  // Fields are battles: a floating report would sit over the fight until the next request.
  if (place !== "town" && place !== "inn" && place !== "church" && place !== "library" && place !== "shop") return [];
  const local = heroes.filter((hero) => hero.place === place);
  const beds = innSlots(art), prayers = churchSlots(art);
  const room = place === "library" ? art.entry("bg-library").library : place === "shop" ? art.entry("bg-shop").shop : undefined;
  const positions = place === "library" ? libraryPositions(art, local.map((hero) => Boolean(hero.librarySearch))) : shopSlots(art);
  const k = place === "shop" ? SHOP_SCALE : LIBRARY_SCALE;
  const inn = art.entry("bg-inn").inn!, church = art.entry("bg-church").church!;
  return local.flatMap((hero, index) => {
    const unread = unreadReports(hero.agent), reply = latestReport(hero.agent) ?? unread[unread.length - 1];
    if (!reply) return [];
    const walker = walkers.find((item) => item.id === hero.id);
    const at = place === "town" ? walker && [walker.x, walker.y - 60]
      : place === "inn" ? index < beds.length && [beds[index][0] + inn.report[0], beds[index][1] + inn.report[1]]
        : place === "church" ? index < prayers.length && [prayers[index][0] + church.report[0], prayers[index][1] + church.report[1]]
          : room && positions[index] && [positions[index]![0] + room.report[0] * k, positions[index]![1] + room.report[1] * k];
    if (!at) return [];
    return [{ id: hero.id, at: unread[unread.length - 1]?.at ?? reply.at,
      x: at[0], y: at[1], unread: Boolean(unread.length), frame: REPORT_FRAME[reply.report?.kind ?? "talk"] }];
  });
}

export function drawReportSigns(ctx: CanvasRenderingContext2D, art: Sheets, time: number,
  signs: ReturnType<typeof reportSigns>, notice?: NoticeMarkFrame): void {
  for (const sign of signs) {
    const wobble = sign.unread ? Math.sin(time / 140) * 3 : 0;
    art.draw(ctx, "ui-report", sign.frame, sign.x, sign.y + wobble, false, 0.65);
    if (sign.unread) art.draw(ctx, "ui-balloons", "exclamation", sign.x + 14, sign.y - 13 + wobble, false, 0.85);
    if (notice?.id === sign.id) {
      notice.signTop = art.spriteTop("ui-report", sign.frame, sign.y + wobble, 0.65);
      if (sign.unread) notice.signTop = Math.min(notice.signTop,
        art.spriteTop("ui-balloons", "exclamation", sign.y - 13 + wobble, 0.85));
    }
  }
}
