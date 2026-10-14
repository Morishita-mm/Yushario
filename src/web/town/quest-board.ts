import { townLayout } from "./art-data";
import type { Sheets } from "./sheets";
import type { TownTheme } from "./themes";
export function questBoardHotspot(art: Sheets, theme: TownTheme | undefined, open: () => void) {
  const [x, y] = townLayout(art.entry("bld-inn").town!, theme).buildings.board;
  const entry = art.entry("bld-questboard");
  return { x: x - entry.foot[0], y: y - entry.foot[1], w: entry.frame[0], h: entry.frame[1], act: open, text: undefined as string | undefined };
}
