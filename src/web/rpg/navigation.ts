export const FIELD_NAMES = { meadow: "そうげん", cave: "どうくつ", forest: "よるのもり" };

export function updateMapNav(place: "world" | "town" | "inn" | keyof typeof FIELD_NAMES,
  project: string | undefined, pinned: boolean | undefined): string {
  const title = place === "world" ? "ワールドマップ"
    : `${project} / ${place === "town" ? "まち" : place === "inn" ? "やどや" : FIELD_NAMES[place]}`;
  document.querySelector("#place-name")!.textContent = title;
  document.querySelector<HTMLButtonElement>("#town-look")!.hidden = place === "world";
  const pin = document.querySelector<HTMLButtonElement>("#town-pin")!;
  pin.hidden = place === "world" || pinned === undefined;
  pin.textContent = pinned ? "◆ ピンどめ中" : "◇ ピンどめ";
  pin.setAttribute("aria-pressed", String(pinned ?? false));
  return title;
}
