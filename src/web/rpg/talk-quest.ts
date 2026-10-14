import type { Quest } from "../../core/quests";
import { tr } from "../language";
export function initTalkQuest(dialog: HTMLElement) {
  const row = document.createElement("div"); row.className = "talk-quest";
  const title = document.createElement("span"), button = document.createElement("button"); button.type = "button";
  button.textContent = tr("▶ べつの クエストに する", "▶ Switch quest"); row.append(title, button);
  dialog.querySelector(".talk-heading")!.after(row);
  let current: (session: string) => Quest | undefined = () => undefined;
  let choose: (session: string, town: string) => void = () => undefined;
  let reportTitle: (hero: string, at: number) => string | undefined = () => undefined;
  let session: string | undefined, town: string | undefined;
  button.onclick = () => { if (session && town) choose(session, town); };
  return {
    setup(get: typeof current, pick: typeof choose, titleAt: typeof reportTitle): void { current = get; choose = pick; reportTitle = titleAt; },
    update(id?: string, key?: string): void {
      session = id; town = key; row.hidden = !session; button.disabled = !town;
      title.textContent = session ? current(session)?.title ?? tr("あたらしい いらい", "A new request") : "";
    },
    reportTitle: (hero: string, at: number) => reportTitle(hero, at),
    title: (session?: string) => session ? current(session)?.title : undefined,
  };
}
