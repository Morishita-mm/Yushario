import { previewDraft, previewUrl, type PreviewLink, type PreviewPage } from "../../core/preview";
import { language, tr } from "../language";
import { openPreview } from "./preview-tabs";

export type PreviewRecipient = { session: string; name: string; disabled?: boolean };
export function previewControls(key: string, links: PreviewLink[], pages: Map<string, PreviewPage>,
  tell?: (text: string, session?: string) => void, recipients?: PreviewRecipient[]): HTMLElement {
  const box = document.createElement("span"); box.className = "preview-controls";
  for (const link of links) {
    const open = document.createElement("button"); open.type = "button";
    open.textContent = `${tr("▶ みる", "▶ View")}${link.name ? ` · ${link.name}` : ""}`; open.title = link.url;
    const checked = previewUrl(link.url, Number(location.port || (location.protocol === "https:" ? 443 : 80)));
    open.disabled = !checked.ok;
    open.onclick = (event) => { event.stopPropagation(); if (checked.ok) openPreview(key, link.id, checked.url); };
    box.append(open);
    const page = pages.get(link.id);
    if (!page) continue;
    const errors = document.createElement("button"); errors.type = "button"; errors.className = "preview-errors";
    errors.textContent = tr(`エラー ${page.count}`, `Errors ${page.count}`);
    errors.onclick = (event) => {
      event.stopPropagation();
      const dialog = document.createElement("dialog"); dialog.className = "report-window preview-window";
      const title = document.createElement("h3"); title.textContent = page.title || link.name || tr("プレビュー", "Preview");
      title.id = `preview-errors-title-${crypto.randomUUID()}`; dialog.setAttribute("aria-labelledby", title.id);
      const url = document.createElement("p"); url.textContent = page.url;
      const list = document.createElement("ol");
      for (const error of page.errors) { const item = document.createElement("li"); item.textContent = error; list.append(item); }
      dialog.append(title, url, list);
      if (!page.count) { const empty = document.createElement("p"); empty.textContent = tr("エラーは ない", "No errors"); dialog.append(empty); }
      if (page.count > page.errors.length) {
        const clipped = document.createElement("p"); clipped.textContent = tr("はじめの 20件まで", "First 20 errors shown"); dialog.append(clipped);
      }
      if (tell && page.errors.length) {
        const recipient = document.createElement("select");
        if (recipients) {
          recipient.append(new Option(tr("パーティーから えらぶ", "Choose a party hero"), ""));
          for (const member of recipients) { const option = new Option(member.name, member.session); option.disabled = Boolean(member.disabled); recipient.append(option); }
          const label = document.createElement("label"); label.append(document.createTextNode(tr("わたす 勇者", "Recipient")), recipient); dialog.append(label);
        }
        const draft = document.createElement("button"); draft.type = "button"; draft.textContent = tr("▶ 勇者に つたえる", "▶ Tell hero");
        draft.disabled = Boolean(recipients);
        recipient.onchange = () => { draft.disabled = !recipient.value || recipient.selectedOptions[0].disabled; };
        draft.onclick = () => {
          if (draft.disabled || recipients && !recipients.some((member) => member.session === recipient.value && !member.disabled)) return;
          dialog.close(); box.closest("dialog")?.close(); tell(previewDraft(page, language), recipients ? recipient.value : undefined);
        }; dialog.append(draft);
      }
      const close = document.createElement("button"); close.type = "button"; close.textContent = tr("▶ とじる", "▶ Close"); close.onclick = () => dialog.close(); dialog.append(close);
      dialog.addEventListener("close", () => dialog.remove(), { once: true });
      dialog.addEventListener("keydown", (key) => key.stopPropagation());
      document.body.append(dialog); dialog.showModal();
    };
    box.append(errors);
  }
  return box;
}
