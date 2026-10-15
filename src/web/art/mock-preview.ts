import type { Quest } from "../../core/quests";
import { previewUrl, type PreviewLink, type PreviewPage } from "../../core/preview";
import { tr } from "../language";
import { questPreview } from "../town/quest-preview";
import { previewControls } from "../town/preview-controls";

export function initMockPreview() {
  const links = new Map<string, PreviewLink[]>(), pages = new Map<string, PreviewPage>();
  function list(quest: Quest): PreviewLink[] {
    let value = links.get(quest.id);
    if (!value) {
      const link = { id: `preview-${quest.id}`, quest: quest.id, town: quest.town, name: tr("町の ページ", "Town page"), url: "http://localhost:5173/" };
      value = [link]; links.set(quest.id, value);
      pages.set(link.id, { url: link.url, title: tr("町の ページ", "Town page"), errors: ["TypeError: quest is undefined", "Preview connection failed"], count: 2 });
    }
    return value;
  }
  function section(quest: Quest): HTMLElement {
    const root = document.createElement("div");
    function render(): void {
      root.replaceChildren(questPreview({ key: quest.id, links: list(quest), pages, candidates: ["http://127.0.0.1:3000/"],
        script: `<script src="${location.origin}/preview-link.js"></script>`,
        add: async (name, url) => {
          const result = previewUrl(url, Number(location.port || 80));
          if (!result.ok) throw new Error(tr("この PC の 別の ポートを えらんで", "Choose another local port"));
          list(quest).push({ id: `mock-preview-${Date.now()}`, quest: quest.id, town: quest.town, name, url: result.url }); render();
        }, remove: async (id) => { links.set(quest.id, list(quest).filter((link) => link.id !== id)); render(); },
        recipients: [{ session: "party-0", name: tr("アレン", "Allen") }, { session: "party-1", name: tr("ミラ", "Mira") },
          { session: "party-2", name: tr("ルカ · ターミナルのみ", "Luca · Terminal only"), disabled: true }],
        tell: (text, session) => {
          const draft = document.createElement("textarea"); draft.rows = 7; draft.value = text; draft.setAttribute("aria-label", tr("勇者への 下書き", "Draft for hero")); draft.dataset.session = session ?? ""; root.append(draft); draft.focus();
        } }));
    }
    render(); return root;
  }
  return { section, rows: (root: HTMLElement, quests: Quest[]) => {
    for (const quest of quests) root.querySelector(`[data-quest="${CSS.escape(quest.id)}"]`)?.append(previewControls(quest.id, list(quest), pages));
  } };
}
