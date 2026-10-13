import type { Sheets } from "../town/sheets";
import { churchPriest } from "../town/church";
import { PRAYERS, SLEEPERS } from "./mock-data";

// Mock commands and exits use the very same manifest boxes as the app.
export function interiorHotspots(art: Sheets, place: "inn" | "church",
  commands: (name: string, x: number, y: number) => void, outside: () => void, priest: () => void) {
  const room = place === "inn" ? art.entry("bg-inn").inn! : art.entry("bg-church").church!;
  const names = place === "inn" ? SLEEPERS : PRAYERS.map((prayer) => prayer.name);
  const [dx, dy, w, h] = room.hit;
  return [
    ...(place === "church" ? [{ ...churchPriest(art), act: priest }] : []),
    ...names.slice(0, room.slots.length).map((name, i) => {
      const [x, y] = room.slots[i];
      return { x: x + dx, y: y + dy, w, h, act: () => commands(name, x, y) };
    }),
    { ...room.exit, text: "▼ そとへ", act: outside },
  ];
}
