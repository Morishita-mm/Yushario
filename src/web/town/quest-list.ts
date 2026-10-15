import { finishedQuest, sortedQuests, type Quest, type QuestState } from "../../core/quests";
import { ago, tr } from "../language";
import { checkMarks } from "./check-marks";
export const questStateLabel = (state: QuestState): string => ({ open: tr("まだ だれも", "Open"), active: tr("とりくみ中", "Active"), waiting: tr("あなたを まっている", "Waiting"), review: tr("かんてい まち", "Review"), done: tr("採った", "Done"), dropped: tr("やめた", "Dropped") })[state];
export const questStateMark = (state: QuestState): string => ({ open: "◇", active: "⚔", waiting: "❗", review: "📜", done: "✓", dropped: "―" })[state];
export function renderQuestList(root: HTMLElement, quests: Quest[], townName: (key: string) => string,
  heroName: (quest: Quest) => string, pick: (quest: Quest) => void, create: () => void, now: number): void {
  const controls = [...root.querySelectorAll<HTMLElement>("[data-focus]")];
  const focused = controls.find((item) => item === document.activeElement)?.dataset.focus;
  const position = controls.findIndex((item) => item.dataset.focus === focused);
  const folds = new Map([...root.querySelectorAll<HTMLDetailsElement>("details[data-town]")].map((item) => [item.dataset.town, item.open]));
  const scroll = root.scrollTop;
  root.replaceChildren();
  const add = document.createElement("button"); add.type = "button"; add.className = "quest-new";
  add.dataset.focus = "new";
  add.textContent = tr("＋ あたらしい クエスト", "＋ New quest"); add.onclick = create; root.append(add);
  if (!quests.length) { const empty = document.createElement("p"); empty.textContent = tr("クエストは まだ ない", "No quests yet"); root.append(empty); }
  const groups = new Map<string, Quest[]>();
  for (const quest of sortedQuests(quests)) groups.set(quest.town, [...(groups.get(quest.town) ?? []), quest]);
  for (const [town, list] of groups) {
    const heading = document.createElement("h3"); heading.className = "party-town"; heading.textContent = townName(town); root.append(heading);
    for (const quest of list.filter((item) => !finishedQuest(item.state))) root.append(row(quest));
    const finished = list.filter((item) => finishedQuest(item.state));
    if (finished.length) {
      const fold = document.createElement("details"); fold.dataset.town = town; fold.open = folds.get(town) ?? false;
      const summary = document.createElement("summary"); summary.dataset.focus = `finished:${town}`;
      summary.textContent = tr(`おわった クエスト（${finished.length}）`, `Finished quests (${finished.length})`);
      fold.append(summary, ...finished.map(row)); root.append(fold);
    }
  }
  if (focused) {
    const next = new Map([...root.querySelectorAll<HTMLElement>("[data-focus]")].map((item) => [item.dataset.focus, item]));
    const target = next.get(focused) ?? controls.slice(position + 1).map((item) => next.get(item.dataset.focus)).find(Boolean)
      ?? controls.slice(0, position).reverse().map((item) => next.get(item.dataset.focus)).find(Boolean) ?? add;
    const fold = target.closest("details"); if (fold && target.tagName !== "SUMMARY") fold.open = true;
    target.focus({ preventScroll: true });
  }
  root.scrollTop = scroll;
  function row(quest: Quest): HTMLElement {
    const row = document.createElement("div"); row.className = "quest-row"; row.dataset.quest = quest.id;
    const button = document.createElement("button"); button.type = "button"; button.className = "quest-row-pick"; button.dataset.focus = `quest:${quest.id}`;
    const title = document.createElement("span"); title.className = "quest-row-title"; title.textContent = `${questStateMark(quest.state)} ${quest.title}`;
    const who = document.createElement("span"); who.textContent = heroName(quest) || tr("まだ だれも", "Unassigned");
    const when = document.createElement("small"); when.textContent = ago(now - quest.updatedAt);
    if (quest.worktreeBranch) {
      const branch = document.createElement("small"); branch.className = "branch-name"; branch.textContent = `⑂ ${quest.worktreeBranch}`; who.append(branch);
    }
    const marks = checkMarks(quest.checks, quest.fingerprint);
    [...marks.querySelectorAll<HTMLElement>(".check-mark")].forEach((item, index) => { item.dataset.focus = `check:${quest.id}:${quest.checks![index].id}`; });
    button.title = questStateLabel(quest.state); button.append(title, who, when); button.onclick = () => pick(quest); row.append(button, marks); return row;
  }
}
