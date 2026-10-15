import { diffLines, type Review, type ReviewDiff, type ReviewFile } from "../../core/review";
import { tr } from "../language";
import { element, option } from "../town/command";
import { coverMap } from "./talk";
import { fileOpen } from "./file-open";
import "./review.css";

const LABEL: Record<ReviewFile["status"], () => string> = {
  modified: () => tr("変更", "Modified"), added: () => tr("追加", "Added"), deleted: () => tr("削除", "Deleted"),
  renamed: () => tr("名前変更", "Renamed"), untracked: () => tr("未追跡", "Untracked"),
};
const READ_KEY = "yushario-reviewed-reports";
export function reportReviewed(hero: string, at: number): boolean {
  try { return (JSON.parse(localStorage.getItem(READ_KEY) ?? "[]") as string[]).includes(`${hero}:${at}`); } catch { return false; }
}
export function markReviewed(hero: string, at: number): void {
  try {
    const key = `${hero}:${at}`, values = JSON.parse(localStorage.getItem(READ_KEY) ?? "[]") as string[];
    localStorage.setItem(READ_KEY, JSON.stringify([...values.filter((value) => value !== key), key].slice(-200)));
  } catch { /* The quest event still records review when available. */ }
}

// The app and mock use this same reader; the mock supplies only its sample git data.
export function openReview(name: string, session: string | { quest: string }, talk: (() => void) | undefined, terminal: (() => void) | undefined,
  reviewed?: () => void, sample?: { review: Review; diffs: Record<string, ReviewDiff>; branchReview?: Review; branchDiffs?: Record<string, ReviewDiff> }): void {
  document.querySelector("#review-dialog")?.remove();
  const dialog = element("dialog", "report-window review-window"); dialog.id = "review-dialog";
  const title = element("h3", undefined, tr(`${name} — かんてい`, `${name} — Review`)); title.id = "review-title";
  dialog.setAttribute("aria-labelledby", title.id);
  const heading = element("div", "review-heading"), content = element("div", "review-content");
  const info = element("p", "review-info"), files = element("div", "review-files"), diff = element("div", "review-diff");
  diff.tabIndex = 0;
  const status = element("p", "review-status"); status.setAttribute("role", "status");
  const close = () => { dialog.close(); dialog.remove(); window.removeEventListener("resize", resize); };
  const resize = () => { if (dialog.open) coverMap(dialog); };
  const reload = option(tr("▶ よみなおす", "▶ Refresh"), () => void load());
  heading.append(title);
  if (talk) heading.append(option(tr("▶ はなす", "▶ Talk"), () => { close(); talk(); }));
  if (terminal) heading.append(option(tr("▶ ターミナル", "▶ Terminal"), () => { close(); terminal(); }));
  heading.append(option(tr("▶ とじる", "▶ Close"), close));
  const toolbar = element("div", "review-toolbar"); toolbar.append(info, reload);
  const comparison = element("div", "review-comparison"), mode = element("select"), base = element("select");
  mode.append(new Option(tr("まだ コミットしていない へんこう", "Uncommitted changes"), "uncommitted"), new Option(tr("ブランチ ぜんたい", "Whole branch"), "branch"));
  const modeLabel = element("label", undefined, tr("比べるもの", "Changes")), baseLabel = element("label", undefined, tr("比べる元", "Base branch"));
  modeLabel.append(mode); baseLabel.append(base); comparison.append(modeLabel, baseLabel);
  mode.onchange = base.onchange = () => { void load(); };
  const columns = element("div", "review-columns"); columns.append(files, diff);
  content.append(toolbar, comparison, status, columns); dialog.append(heading, content); document.body.append(dialog);
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  dialog.addEventListener("keydown", (event) => { event.stopPropagation(); if (event.key === "Escape" && !event.isComposing) { event.preventDefault(); close(); } });
  dialog.addEventListener("click", (event) => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) close();
  });
  window.addEventListener("resize", resize);
  const token = new URLSearchParams(location.search).get("token") ?? "";
  let current: Review | undefined, selected: string | undefined, generation = 0, stamped = false;
  async function request<T>(path?: string): Promise<T> {
    const params = new URLSearchParams({ token, ...(typeof session === "string" ? { session } : { quest: session.quest }), mode: mode.value });
    if (base.value) params.set("base", base.value);
    if (path !== undefined) params.set("path", path);
    const response = await fetch(`/api/review${path === undefined ? "" : "/diff"}?${params}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? tr("よめなかった", "Could not read"));
    return data as T;
  }
  async function select(file: ReviewFile): Promise<void> {
    const version = ++generation; selected = file.path;
    for (const row of files.querySelectorAll<HTMLElement>(".review-file")) row.classList.toggle("selected", row.dataset.path === selected);
    diff.replaceChildren(element("p", "hint", tr("よんでいる…", "Reading…")));
    try {
      const result = sample ? (mode.value === "branch" ? sample.branchDiffs ?? sample.diffs : sample.diffs)[file.path] ?? { text: "" } : await request<ReviewDiff>(file.path);
      if (!dialog.open || version !== generation) return;
      diff.replaceChildren();
      if (result.tooLarge || result.binary) diff.append(element("p", "hint", result.binary ? tr("バイナリの ファイル", "Binary file") : tr("大きすぎて 出せない", "Too large to show")));
      else if (!result.text) diff.append(element("p", "hint", tr("中身の 変更は ない", "No content changes")));
      else {
        const pre = element("pre", "diff-lines");
        for (const line of diffLines(result.text)) {
          const row = element("span", `diff-line ${line.kind}`);
          row.append(element("span", "diff-number", line.old === undefined ? "" : String(line.old)),
            element("span", "diff-number", line.next === undefined ? "" : String(line.next)), element("span", "diff-text", line.text));
          pre.append(row);
        }
        diff.append(pre);
      }
    } catch (error) { if (version === generation && dialog.open) diff.replaceChildren(element("p", "hint", error instanceof Error ? error.message : String(error))); }
  }
  async function load(): Promise<void> {
    const version = ++generation; reload.disabled = true; files.replaceChildren(); diff.replaceChildren();
    status.textContent = tr("よんでいる…", "Reading…");
    try {
      current = sample ? (mode.value === "branch" ? sample.branchReview ?? sample.review : sample.review) : await request<Review>();
      if (!dialog.open || version !== generation) return;
      if (!stamped) { stamped = true; reviewed?.(); }
      const selectedBase = base.value || current.comparison?.base || current.comparison?.defaultBase;
      base.replaceChildren(new Option(tr("branch を えらぶ", "Choose a branch"), ""), ...(current.comparison?.branches ?? []).map((branch) => new Option(branch, branch)));
      if (selectedBase) base.value = selectedBase;
      base.disabled = mode.value !== "branch" || !base.options.length;
      info.textContent = `${current.branch || "—"} · HEAD ${current.head || "—"} · ↑${current.ahead} ↓${current.behind}${current.comparison?.mergeBase ? ` · merge-base ${current.comparison.mergeBase.slice(0, 7)}` : ""}`;
      info.title = current.cwd;
      status.textContent = current.files.length ? "" : tr("変更は ない", "No changes");
      for (const file of current.files) {
        const row = element("div", "review-file"); row.dataset.path = file.path;
        const button = option(`${LABEL[file.status]()} · ${file.oldPath ? `${file.oldPath} → ` : ""}${file.path}`, () => void select(file));
        button.className = "review-file-select";
        row.append(button);
        if (file.added !== undefined) row.append(element("span", "review-numstat", `+${file.added} −${file.removed ?? 0}`));
        const open = fileOpen(current.cwd, { path: file.path }); if (open) row.append(open);
        files.append(row);
      }
      // Never read an untracked file until a person chooses it (it might be .env).
      const first = current.files.find((file) => file.path === selected && file.status !== "untracked") ?? current.files.find((file) => file.status !== "untracked");
      if (first) void select(first);
      else diff.append(element("p", "hint", tr("ファイルを えらぼう", "Choose a file")));
    } catch (error) { if (dialog.open && version === generation) status.textContent = error instanceof Error ? error.message : String(error); }
    finally { if (dialog.open) reload.disabled = false; }
  }
  coverMap(dialog); dialog.showModal(); void load();
}
