import { tacticLabel, TACTICS, type Tactic, type TacticGap, type TacticStatus } from "../../core/tactics";
import { language, tr } from "../language";
import { partyRequest } from "./quest-party";

// The "さくせん" box of the party window (docs/PLATFORM.md stage 24): choose how the party hands work on.
const ABOUT: Record<Tactic, () => string> = {
  obey: () => tr("自動では 送らない。あなたが 全員に 頼む。", "Nothing is sent automatically. You ask everyone."),
  review: () => tr("担当が 報告したら レビュー役が 見て、要修正なら 担当に 戻す（3回まで）。", "After the owner reports, reviewers check it and send changes back (up to 3 rounds)."),
  research: () => tr("調べる役が 先に 調べ、その報告を 添えて 担当に 送る。", "Researchers look first; the owner gets the request with their reports."),
  delegate: () => tr("しき役が 仲間に 仕事を 配る。仲間の 報告は しき役に 届く。", "The commander hands out work; members' reports go to the commander."),
};
export const gapLabel = (gap: TacticGap): string => ({
  owner: tr("担当が いない", "No owner"), reviewer: tr("レビュー役が いない", "No reviewer"),
  "same-folder": tr("担当と 同じ フォルダの レビュー役が いない", "No reviewer in the owner's folder"),
  researcher: tr("調べる役が いない", "No researcher"), commander: tr("しき役が いない", "No commander"),
  "separate-commander": tr("しき役と 担当は 別の 勇者に する", "The commander must not be the owner"),
})[gap];
// One line for the card and the window: what the tactic is doing now.
export function tacticProgress(status: TacticStatus): string {
  const name = tacticLabel(status.tactic, language);
  if (status.stopped) return tr(`作戦が 止まった：${status.stopped}`, `Tactic stopped: ${status.stopped}`);
  if (status.running) return tr(`${name}で 進んでいる：返事 ${status.total - status.waiting}/${status.total}（${status.round}回目）`,
    `${name} is running: ${status.total - status.waiting}/${status.total} replied (round ${status.round})`);
  if (status.done) return tr(`${name}：終わった（${status.round}回目）。報告を 見よう`, `${name}: finished (round ${status.round}). Read the report`);
  return tr(`さくせん：${name}`, `Tactic: ${name}`);
}

export function tacticBox(quest: string, mock: boolean, command: (text: string, run: () => void, primary?: boolean) => HTMLButtonElement,
  say: (text: string) => void, changed: () => void) {
  const root = document.createElement("section"); root.className = "pw-box pw-tactics";
  let status: TacticStatus | undefined;
  const prefix = `quests/${encodeURIComponent(quest)}`;
  async function choose(tactic: Tactic): Promise<void> {
    status = await partyRequest(`${prefix}/tactic`, "POST", { tactic });
    render(); changed(); say(ABOUT[tactic]());
  }
  function render(): void {
    const heading = document.createElement("h4"); heading.textContent = tr("さくせん", "Tactic");
    root.replaceChildren(heading);
    if (!status) { const wait = document.createElement("p"); wait.textContent = mock ? tr("（見本では 作戦を 選べない）", "(Tactics are not available in the sample)") : tr("よんでいる…", "Loading…"); root.append(wait); return; }
    const line = document.createElement("p"); line.className = "pw-progress"; line.textContent = tacticProgress(status); root.append(line);
    if (status.running) root.append(command(tr("止める（命令に従え に 戻す）", "Stop (back to Follow orders)"), () => void choose("obey").catch((error: Error) => say(error.message))));
    const list = document.createElement("div"); list.className = "pw-tactic-list";
    for (const tactic of TACTICS) {
      const fit = status.fits[tactic], button = command(tacticLabel(tactic, language), () => void choose(tactic).catch((error: Error) => say(error.message)));
      button.setAttribute("aria-pressed", String(tactic === status.tactic));
      button.disabled = !fit.ok || status.running && tactic !== "obey";
      const about = document.createElement("small"); about.textContent = fit.ok ? ABOUT[tactic]() : fit.gaps.map(gapLabel).join("・");
      button.append(about); list.append(button);
    }
    root.append(list);
  }
  async function load(): Promise<TacticStatus | undefined> {
    if (!mock) status = await partyRequest(`${prefix}/tactic`);
    render(); return status;
  }
  render();
  return { root, load, outside: () => new Set(status?.tactic === "obey" ? [] : status?.fit.outside ?? []) };
}
