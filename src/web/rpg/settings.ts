import { language, tr } from "../language";
import { windowBox } from "../town/herald";
import { loadSettings, saveSettings } from "./ledger";
import { selectedEditor, selectEditor } from "./file-open";
import type { Editor } from "../../core/file-path";
import { questSettings } from "./quest-settings";

const DAYS = [0, 7, 14, 30, 90];
const dayLabel = (days: number) => days === 0 ? tr("しまわない", "Never") : tr(`${days}日`, `${days} days`);

// The settings window: loads once when opened; a choice is saved at once.
export function showSettings(layer: HTMLElement, town?: string): void {
  const box = windowBox(layer, tr("せってい", "Settings"), () => undefined);
  const field = document.createElement("fieldset");
  field.id = "archive-days";
  const legend = document.createElement("legend");
  legend.textContent = tr("町を しまうまで", "Archive towns after");
  field.append(legend);
  const status = document.createElement("p");
  status.className = "settings-status";
  status.setAttribute("role", "status");
  status.textContent = tr("よみこみ中…", "Loading…");
  let touched = false; // a choice made before loading finishes wins over the loaded value
  const radios = DAYS.map((days) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "archiveAfterDays";
    input.value = String(days);
    input.addEventListener("change", () => {
      touched = true;
      field.disabled = true;
      status.textContent = tr("ほぞん中…", "Saving…");
      saveSettings({ archiveAfterDays: days })
        .then(() => { status.textContent = tr(`${dayLabel(days)}に しました。`, `Set to ${dayLabel(days)}.`); })
        .catch(() => { input.checked = false; status.textContent = tr("ほぞんできませんでした。もういちど おためしください。", "Could not save. Try again."); })
        .finally(() => { field.disabled = false; });
    });
    label.append(input, document.createTextNode(dayLabel(days)));
    field.append(label);
    return input;
  });
  const langLabel = document.createElement("label");
  langLabel.textContent = tr("言語 ", "Language ");
  const select = document.createElement("select");
  select.id = "settings-language";
  select.append(new Option("日本語", "ja"), new Option("English", "en"));
  select.value = language;
  select.addEventListener("change", () => {
    select.disabled = true;
    void saveSettings({ language: select.value as "ja" | "en" }).then(() => location.reload()).catch(() => {
      select.disabled = false; select.value = language;
      status.textContent = tr("ほぞんできませんでした。もういちど おためしください。", "Could not save. Try again.");
    });
  });
  langLabel.append(select);
  const editorLabel = document.createElement("label"); editorLabel.textContent = tr("ファイルを ひらく：", "Open files with: ");
  const editor = document.createElement("select"); editor.id = "settings-editor";
  editor.append(new Option(tr("なし（パスを コピー）", "None (copy path)"), "none"), new Option("VS Code", "vscode"), new Option("Cursor", "cursor"));
  editor.value = selectedEditor();
  editor.addEventListener("change", () => selectEditor(editor.value as Editor));
  editorLabel.append(editor);
  box.append(langLabel, editorLabel, field, status);
  questSettings(box, status, town);
  loadSettings().then((settings) => {
    if (touched) return;
    for (const radio of radios) radio.checked = Number(radio.value) === settings.archiveAfterDays;
    status.textContent = "";
  }).catch(() => { if (!touched) status.textContent = tr("せっていを よみこめませんでした。", "Could not load settings."); });
}
