import { tr } from "../language";
import { mockChecks, mockFingerprint } from "./mock-checks";
export { mockReportChecks } from "./mock-checks";
import { initMockPreview } from "./mock-preview";
import type { QuestDetail } from "../../core/quests";
import { renderQuestList } from "../town/quest-list";
import { questCard } from "../town/quest-card";
import { windowBox } from "../town/herald";
import type { Project } from "../town/world";
import "../rpg/quests.css";
export function initMockQuests(projects: Project[], layer: HTMLElement, report: (hero: string) => void) {
  const now = Date.now(), previews = initMockPreview();
  let quests: QuestDetail[] = projects.map((project, i) => ({ id: `mock-${i}`, town: project.repo,
    title: tr("町の バグを なおす", "Fix the town's bugs"), purpose: tr("旅を つづけよう", "Keep the adventure going"),
    state: i % 2 ? "active" : "review", createdAt: now - 600000, updatedAt: now - i * 60000,
    checks: mockChecks(`mock-${i}`), fingerprint: mockFingerprint,
    events: [{ id: i, quest: `mock-${i}`, at: now - i * 60000, kind: "request", title: tr("町の バグを なおす", "Fix the town's bugs") }] }));
  function open(quest: QuestDetail): void {
    const box = windowBox(layer, quest.title, () => undefined);
    box.append(questCard(quest, "", async (patch) => { Object.assign(quest, patch); }, () => undefined, report,
      async () => { quests = quests.filter((item) => item.id !== quest.id); layer.hidden = true; }, undefined, undefined, previews.section(quest), {
        talk: report, review: report, embark: () => undefined,
        mock: (["implement", "review", "command"] as const).map((role, i) => ({ quest: quest.id, session: `party-${i}`, hero: `party-${i}`,
          name: [tr("アレン", "Allen"), tr("ミラ", "Mira"), tr("ルカ", "Luca")][i], role, note: "", writer: i === 0, active: true, joinedAt: now + i,
          sessionInfo: { id: `party-${i}`, preset: "shell", cwd: "/tmp/town-base", branch: "quest/town", project: quest.town, createdAt: now } })),
      }));
  }
  return (town?: string) => {
    const list = quests.filter((quest) => town === undefined || quest.town === town);
    renderQuestList(document.querySelector<HTMLElement>("#quests")!, list, (key) => key, () => "", (quest) => open(quests.find((item) => item.id === quest.id)!),
      () => { const title = prompt(tr("クエストの 題", "Quest title")); if (!title) return;
        const quest: QuestDetail = { id: `mock-${Date.now()}`, town: town ?? projects[0].repo, title, purpose: "", state: "open", createdAt: Date.now(), updatedAt: Date.now(), events: [] };
        quests.push(quest); open(quest);
      }, Date.now());
    previews.rows(document.querySelector<HTMLElement>("#quests")!, list);
    return list.length;
  };
}
