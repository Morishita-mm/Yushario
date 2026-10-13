import { FIGHTS, PRAYERS, SLEEPERS, townHeroes } from "./mock-data";

const PLACES = {
  town: ["🏘", "まち"], meadow: ["⚔️", "そうげん"], cave: ["⚔️", "どうくつ"], forest: ["⚔️", "よるのもり"], inn: ["💤", "やどや"], church: ["🙏", "きょうかい"],
} as const;
export type MockPlace = keyof typeof PLACES;

// The mock's ゆうしゃ tab: every mock hero lives in the current mock town, one row each.
export function renderMockParty(root: HTMLElement, town: string, pick: (name: string, place: MockPlace) => void): number {
  const heroes: [string, MockPlace][] = [
    ...townHeroes().map((hero): [string, MockPlace] => [hero.name, "town"]),
    ...(["meadow", "cave", "forest"] as const).flatMap((theme) => FIGHTS[theme].map((fight): [string, MockPlace] => [fight.name, theme])),
    ...SLEEPERS.map((name): [string, MockPlace] => [name, "inn"]),
    ...PRAYERS.map((prayer): [string, MockPlace] => [prayer.name, "church"]),
  ];
  const heading = Object.assign(document.createElement("h3"), { className: "party-town", textContent: `${town}（${heroes.length}人）` });
  root.replaceChildren(heading, ...heroes.map(([name, place]) => {
    const row = Object.assign(document.createElement("button"), { type: "button", className: "notice" });
    const [icon, where] = PLACES[place];
    for (const [className, text] of [["icon", icon], ["text", name], ["ago", where]]) row.append(Object.assign(document.createElement("span"), { className, textContent: text }));
    row.addEventListener("click", () => pick(name, place));
    return row;
  }));
  return heroes.length;
}
