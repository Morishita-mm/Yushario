import { absoluteFile, editorUrl, type Editor, type FileReference } from "../../core/file-path";
import { tr } from "../language";
const KEY = "yushario-editor";
export function selectedEditor(): Editor {
  try { const value = localStorage.getItem(KEY); return value === "vscode" || value === "cursor" ? value : "none"; }
  catch { return "none"; }
}
export function selectEditor(editor: Editor): void {
  try { localStorage.setItem(KEY, editor); } catch { /* This page can still use copy. */ }
  for (const link of document.querySelectorAll<HTMLAnchorElement>("a.file-open")) updateLink(link);
}
function updateLink(link: HTMLAnchorElement): void {
  const href = editorUrl(selectedEditor(), link.dataset.absolute!, Number(link.dataset.line) || undefined);
  if (href) link.href = href; else link.removeAttribute("href");
  link.setAttribute("role", href ? "link" : "button");
}
export function fileOpen(cwd: string, ref: FileReference): HTMLAnchorElement | undefined {
  const absolute = absoluteFile(cwd, ref.path);
  if (!absolute) return;
  const link = document.createElement("a"); link.className = "file-open"; link.tabIndex = 0;
  link.textContent = tr("ひらく", "Open"); link.dataset.absolute = absolute;
  if (ref.line) link.dataset.line = String(ref.line);
  link.title = `${absolute}${ref.line ? `:${ref.line}` : ""}`;
  updateLink(link);
  link.addEventListener("click", (event) => {
    event.stopPropagation(); updateLink(link);
    if (selectedEditor() !== "none") return;
    event.preventDefault();
    void navigator.clipboard.writeText(link.title).then(() => { link.textContent = tr("コピーした", "Copied"); })
      .catch(() => { link.textContent = tr("コピーできない", "Cannot copy"); });
  });
  link.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); link.click(); } });
  return link;
}
export async function sessionFolder(terminal: string): Promise<string | undefined> {
  const token = new URLSearchParams(location.search).get("token") ?? "";
  const response = await fetch(`/api/sessions?${new URLSearchParams({ token })}`);
  if (!response.ok) return;
  const sessions = await response.json() as { id: string; cwd: string }[];
  return sessions.find((session) => session.id === terminal)?.cwd;
}
