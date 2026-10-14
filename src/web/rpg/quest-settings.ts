import { tr } from "../language";
import { loadSettings, saveSettings } from "./ledger";
import { questRequest } from "./quests";
export function questSettings(box: HTMLElement, status: HTMLElement, town?: string): void {
  const label = document.createElement("label"), keep = document.createElement("input"); keep.type = "checkbox"; keep.id = "settings-conversation";
  label.append(keep, document.createTextNode(tr("かいわも のこす", "Keep conversations too")));
  const hint = document.createElement("p"); hint.className = "hint";
  hint.textContent = tr("題（依頼の1行目）は いつも のこります", "Titles (the first request line) are always kept");
  let touched = false;
  keep.onchange = () => { touched = true; keep.disabled = true;
    void saveSettings({ saveConversation: keep.checked }).then(() => { status.textContent = tr("のこした！", "Saved!"); })
      .catch((error: Error) => { keep.checked = !keep.checked; status.textContent = error.message; }).finally(() => { keep.disabled = false; });
  };
  void loadSettings().then((settings) => { if (!touched) keep.checked = settings.saveConversation === true; });
  const erase = document.createElement("fieldset"), legend = document.createElement("legend"); legend.textContent = tr("クエストの きろくを けす", "Delete quest records"); erase.append(legend);
  for (const [text, key] of [[tr("この町", "This town"), town], [tr("すべて", "All towns"), undefined]] as const) {
    const button = document.createElement("button"); button.type = "button"; button.textContent = text;
    if (text === tr("この町", "This town") && !key) button.disabled = true;
    button.onclick = () => {
      if (!confirm(tr(`${text}の クエストの きろくを けす？`, `Delete quest records: ${text}?`))) return;
      button.disabled = true;
      void questRequest(key ? `?town=${encodeURIComponent(key)}` : "", "DELETE")
        .then(() => { status.textContent = tr("クエストの きろくを けした", "Quest records deleted"); })
        .catch((error: Error) => { status.textContent = error.message; }).finally(() => { button.disabled = false; });
    }; erase.append(button);
  }
  box.append(label, hint, erase);
}
