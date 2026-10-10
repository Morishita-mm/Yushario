import { windowBox } from "../town/herald";
import { loadSettings, saveSettings } from "./ledger";

const DAYS = [0, 7, 14, 30, 90];
const dayLabel = (days: number) => days === 0 ? "しまわない" : `${days}日`;

// The settings window: loads once when opened; a choice is saved at once.
export function showSettings(layer: HTMLElement): void {
  const box = windowBox(layer, "せってい", () => undefined);
  const field = document.createElement("fieldset");
  field.id = "archive-days";
  const legend = document.createElement("legend");
  legend.textContent = "町を しまうまで";
  field.append(legend);
  const status = document.createElement("p");
  status.className = "settings-status";
  status.setAttribute("role", "status");
  status.textContent = "よみこみ中…";
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
      status.textContent = "ほぞん中…";
      saveSettings({ archiveAfterDays: days })
        .then(() => { status.textContent = `${dayLabel(days)}に しました。`; })
        .catch(() => { input.checked = false; status.textContent = "ほぞんできませんでした。もういちど おためしください。"; })
        .finally(() => { field.disabled = false; });
    });
    label.append(input, document.createTextNode(dayLabel(days)));
    field.append(label);
    return input;
  });
  const hint = document.createElement("p");
  hint.className = "who";
  hint.textContent = "勇者がいない 古い町を しまいます。ピンどめした町は しまわれません。";
  box.append(field, hint, status);
  loadSettings().then((settings) => {
    if (touched) return;
    for (const radio of radios) radio.checked = Number(radio.value) === settings.archiveAfterDays;
    status.textContent = "";
  }).catch(() => { if (!touched) status.textContent = "せっていを よみこめませんでした。"; });
}
