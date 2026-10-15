import type { Quest, QuestReportLink } from "../../core/quests";

type Link = QuestReportLink & { quest: string };
const links = new Map<string, Link | null>();
const pending = new Set<string>();
const token = new URLSearchParams(location.search).get("token") ?? "";

// Called only for replies in the open talk window. The next normal talk update
// picks up the loaded title; old saved reports never enter the WS snapshot.
export function reportQuestTitle(hero: string, at: number, quests: Quest[]): string | undefined {
  const key = `${hero}:${at}`, link = links.get(key);
  if (!links.has(key) && !pending.has(key) && pending.size < 200) {
    pending.add(key);
    void fetch(`/api/quests/report-link?hero=${encodeURIComponent(hero)}&at=${at}&token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        links.set(key, await response.json() as Link | null);
        if (links.size > 200) links.delete(links.keys().next().value!);
      }).catch(() => undefined).finally(() => pending.delete(key));
  }
  return link ? quests.find((quest) => quest.id === link.quest)?.title : undefined;
}
