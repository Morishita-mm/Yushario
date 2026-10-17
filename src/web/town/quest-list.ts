import { finishedQuest, sortedQuests, type Quest, type QuestState } from "../../core/quests";
import { questStage, yourTurn, type QuestStage } from "../../core/quest-stage";
import { ago, tr } from "../language";
import { checkMarks } from "./check-marks";
import { iconLabel, type IconName } from "../icons.js";
// Saved states, as statuses. The list and card lead with the stage (what to do next) instead.
export const questStateLabel = (state: QuestState): string => ({ open: tr("準備中", "Getting ready"), active: tr("作業中", "Working"), waiting: tr("返事を待っている", "Waiting for you"), review: tr("報告が届いた", "Report arrived"), done: tr("採用した", "Adopted"), dropped: tr("やめた", "Dropped") })[state];
export const questStageLabel = (stage: QuestStage): string => ({ assign: tr("任せる人を決める", "Choose a hero"), send: tr("指示を送る", "Send the request"), work: tr("作業中", "Working"), waiting: tr("返事を待っている", "Waiting for you"), review: tr("報告を見る", "Read the report"), done: tr("採用した", "Adopted"), dropped: tr("やめた", "Dropped") })[stage];
const STAGE_MARK: Record<QuestStage, IconName> = { assign: "assign", send: "mail", work: "swords", waiting: "alert", review: "scroll", done: "check", dropped: "minus" };
export function renderQuestList(root: HTMLElement, quests: Quest[], townName: (key: string) => string,
  heroName: (quest: Quest) => string, pick: (quest: Quest) => void, create: () => void, now: number,
  ownerHere: (quest: Quest) => boolean = () => true, remove?: (quest: Quest) => void): void {
  const controls = [...root.querySelectorAll<HTMLElement>("[data-focus]")];
  const focused = controls.find((item) => item === document.activeElement)?.dataset.focus;
  const position = controls.findIndex((item) => item.dataset.focus === focused);
  const finishedOpen = root.querySelector<HTMLDetailsElement>("details[data-finished]")?.open ?? false;
  const scroll = root.scrollTop;
  root.replaceChildren();
  const add = document.createElement("button"); add.type = "button"; add.className = "quest-new";
  add.dataset.focus = "new";
  add.textContent = tr("＋ 新しいクエストを書く", "＋ Write a new quest"); add.onclick = create; root.append(add);
  if (!quests.length) { const empty = document.createElement("p"); empty.textContent = tr("クエストは まだ ない", "No quests yet"); root.append(empty); }
  // Grouped by whose turn it is, so the quests waiting on the person come first.
  const sorted = sortedQuests(quests);
  const yours = sorted.filter((quest) => yourTurn(questStage(quest, ownerHere(quest)))), working = sorted.filter((quest) => questStage(quest, ownerHere(quest)) === "work");
  const finished = sorted.filter((quest) => finishedQuest(quest.state));
  for (const [text, list, className] of [[tr("あなたの番", "Your turn"), yours, "you"], [tr("勇者が作業中", "Heroes working"), working, "work"]] as const) {
    if (!list.length) continue;
    const heading = document.createElement("h3"); heading.className = `quest-group ${className}`; heading.textContent = tr(`${text}（${list.length}）`, `${text} (${list.length})`);
    root.append(heading, ...list.map(row));
  }
  if (finished.length) {
    const fold = document.createElement("details"); fold.dataset.finished = "true"; fold.open = finishedOpen;
    const summary = document.createElement("summary"); summary.dataset.focus = "finished";
    summary.textContent = tr(`おわった（${finished.length}）`, `Finished (${finished.length})`);
    fold.append(summary, ...finished.map(row)); root.append(fold);
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
    const stage = questStage(quest, ownerHere(quest));
    const row = document.createElement("div"); row.className = "quest-row"; row.dataset.quest = quest.id;
    const button = document.createElement("button"); button.type = "button"; button.className = "quest-row-pick"; button.dataset.focus = `quest:${quest.id}`;
    const top = document.createElement("span"); top.className = "quest-row-top";
    const title = document.createElement("span"); title.className = "quest-row-title"; title.textContent = quest.title;
    const chip = document.createElement("span"); chip.className = `quest-chip ${yourTurn(stage) ? "you" : stage === "work" ? "work" : "end"}`;
    chip.append(iconLabel(STAGE_MARK[stage], questStageLabel(stage))); top.append(title, chip);
    const meta = document.createElement("small"); meta.className = "quest-row-meta";
    const who = heroName(quest);
    meta.append([who || (finishedQuest(quest.state) ? tr("いまは 担当なし", "No owner now") : tr("まだ 誰にも任せていない", "Not assigned yet")), tr(`町：${townName(quest.town)}`, `Town: ${townName(quest.town)}`)].join(" · "));
    if (quest.worktreeBranch) meta.append(" · ", iconLabel("branch", quest.worktreeBranch));
    meta.append(` · ${ago(now - quest.updatedAt)}`);
    const marks = checkMarks(quest.checks, quest.fingerprint);
    [...marks.querySelectorAll<HTMLElement>(".check-mark")].forEach((item, index) => { item.dataset.focus = `check:${quest.id}:${quest.checks![index].id}`; });
    button.title = questStateLabel(quest.state); button.append(top, meta); button.onclick = () => pick(quest); row.append(button, marks);
    if (remove) {
      const del = document.createElement("button"); del.type = "button"; del.className = "quest-row-delete"; del.dataset.focus = `delete:${quest.id}`;
      del.append(iconLabel("trash", tr("消す", "Delete"))); del.setAttribute("aria-label", tr(`「${quest.title}」を 消す`, `Delete "${quest.title}"`));
      del.onclick = () => remove(quest); row.append(del);
    }
    return row;
  }
}
