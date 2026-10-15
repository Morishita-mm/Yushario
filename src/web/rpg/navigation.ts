import { tr } from "../language";
export const FIELD_NAMES = { meadow: tr("そうげん", "Meadow"), cave: tr("どうくつ", "Cave"), forest: tr("よるのもり", "Night Forest") };

export function updateMapNav(place: "world" | "town" | "inn" | "church" | keyof typeof FIELD_NAMES,
  project: string | undefined, pinned: boolean | undefined): string {
  const title = place === "world" ? tr("ワールドマップ", "World Map")
    : `${project} / ${place === "town" ? tr("まち", "Town") : place === "inn" ? tr("やどや", "Inn") : place === "church" ? tr("きょうかい", "Church") : FIELD_NAMES[place]}`;
  document.querySelector<HTMLButtonElement>("#world-back")!.hidden = place === "world";
  for (const id of ["sleeping-towns", "archived-towns"]) document.querySelector<HTMLButtonElement>(`#${id}`)!.hidden = place !== "world";
  document.querySelector<HTMLButtonElement>("#town-look")!.hidden = place !== "town";
  const pin = document.querySelector<HTMLButtonElement>("#town-pin")!;
  pin.hidden = place === "world" || pinned === undefined;
  pin.textContent = pinned ? tr("◆ ピンどめ中", "◆ Pinned") : tr("◇ ピンどめ", "◇ Pin");
  pin.setAttribute("aria-pressed", String(pinned ?? false));
  return title;
}
