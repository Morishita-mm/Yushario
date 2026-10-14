import type { PreviewLink, PreviewPage } from "../../core/preview";
import { tr } from "../language";
import { previewControls } from "./preview-controls";
import "./preview.css";

export type QuestPreviewView = {
  key: string; links: PreviewLink[]; candidates: string[]; pages: Map<string, PreviewPage>; script: string;
  add: (name: string, url: string) => Promise<void>; remove: (id: string) => Promise<void>; tell?: (text: string) => void;
};
export function questPreview(view: QuestPreviewView): HTMLElement {
  const section = document.createElement("section"); section.className = "quest-preview";
  const title = document.createElement("h4"); title.textContent = tr("プレビュー", "Preview"); section.append(title);
  const status = document.createElement("p"); status.setAttribute("role", "status");
  for (const link of view.links) {
    const row = document.createElement("div"); row.className = "preview-link";
    const address = document.createElement("p"); address.textContent = link.url;
    const remove = document.createElement("button"); remove.type = "button"; remove.textContent = tr("はずす", "Unlink");
    remove.onclick = () => { remove.disabled = true; void view.remove(link.id).catch((error: Error) => { status.textContent = error.message; remove.disabled = false; }); };
    row.append(previewControls(view.key, [link], view.pages, view.tell), remove, address); section.append(row);
  }
  const form = document.createElement("form"), name = document.createElement("input"), url = document.createElement("input");
  name.maxLength = 200; url.maxLength = 4096; url.required = true; url.type = "url"; url.placeholder = "http://localhost:5173/";
  for (const [text, field] of [[tr("名前（なくても よい）", "Name (optional)"), name], ["URL", url]] as const) {
    const label = document.createElement("label"); label.append(document.createTextNode(text), field); form.append(label);
  }
  const add = document.createElement("button"); add.type = "submit"; add.textContent = tr("＋ つなぐ", "＋ Link"); form.append(add);
  form.onsubmit = (event) => {
    event.preventDefault(); add.disabled = true;
    void view.add(name.value, url.value).catch((error: Error) => { status.textContent = error.message; }).finally(() => { add.disabled = false; });
  };
  section.append(form, status);
  const candidates = view.candidates.filter((candidate) => !view.links.some((link) => link.url === candidate));
  if (candidates.length) {
    const heading = document.createElement("h4"); heading.textContent = tr("みつけた URL", "Found URLs"); section.append(heading);
    for (const candidate of candidates) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = `＋ ${candidate}`;
      button.onclick = () => { button.disabled = true; void view.add("", candidate).catch((error: Error) => { status.textContent = error.message; button.disabled = false; }); };
      section.append(button);
    }
  }
  const copy = document.createElement("button"); copy.type = "button"; copy.textContent = tr("▶ つなぐ 一行を コピー", "▶ Copy link script");
  const snippet = document.createElement("code"); snippet.textContent = view.script;
  copy.onclick = () => { void navigator.clipboard.writeText(view.script).then(() => { status.textContent = tr("コピーした！", "Copied!"); })
    .catch(() => { status.textContent = tr("この 一行を コピーして", "Copy this line"); }); };
  section.append(copy, snippet); return section;
}
