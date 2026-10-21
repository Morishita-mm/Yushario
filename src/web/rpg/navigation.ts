import { tr } from "../language";
import type { HeroPlace } from "../../core/town";
import { iconLabel } from "../icons";
export const FIELD_NAMES = { meadow: tr("そうげん", "Meadow"), cave: tr("どうくつ", "Cave"), forest: tr("よるのもり", "Night Forest") };

export function updateMapNav(place: "world" | HeroPlace,
  project: string | undefined, pinned: boolean | undefined): string {
  const title = place === "world" ? tr("ワールドマップ", "World Map")
    : `${project} / ${place === "town" ? tr("まち", "Town") : place === "inn" ? tr("やどや", "Inn") : place === "church" ? tr("きょうかい", "Church") : place === "library" ? tr("としょかん", "Library") : place === "shop" ? tr("どうぐや", "Item Shop") : FIELD_NAMES[place]}`;
  document.querySelector<HTMLButtonElement>("#world-back")!.hidden = place === "world";
  for (const id of ["sleeping-towns", "archived-towns"]) document.querySelector<HTMLButtonElement>(`#${id}`)!.hidden = place !== "world";
  document.querySelector<HTMLButtonElement>("#town-look")!.hidden = place !== "town";
  const pin = document.querySelector<HTMLButtonElement>("#town-pin")!;
  pin.hidden = place === "world" || pinned === undefined;
  pin.replaceChildren(iconLabel("pin", pinned ? tr("ピンどめ中", "Pinned") : tr("ピンどめ", "Pin")));
  pin.setAttribute("aria-pressed", String(pinned ?? false));
  return title;
}
