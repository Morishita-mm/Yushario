import { tr } from "../language";
import { sessionRequest, type Session } from "../terminal";
import { worktreeSlug, type Worktree } from "../../core/worktrees";
import type { Quest } from "../../core/quests";
import { element } from "./status-card";

export type BaseInfo = { cwd: string; worktrees: Worktree[]; branches: string[]; current?: string; root: string; defaultParent: string };
const token = new URLSearchParams(location.search).get("token") ?? "";
export async function worktreeRequest<T>(method: string, cwd: string, body?: object): Promise<T> {
  const response = await fetch(`/api/worktrees?${new URLSearchParams({ token, cwd })}`, {
    method, cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cwd, ...body }) } : {}),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? tr("拠点を よみこめなかった", "Could not read bases"));
  return value as T;
}

// Only this launch window's destination and draft live here; Git remains on the server.
export function initExpeditionBases(root: HTMLElement, heroName: (terminal: string) => string | undefined,
  heroKind: (preset: string) => boolean) {
  const label = element("label", undefined, tr("この町の 拠点", "Bases in this town"));
  const select = element("select"); select.id = "expedition-base"; label.htmlFor = select.id;
  const fields = element("div", "base-fields");
  const base = element("select"); base.id = "expedition-base-branch";
  const branch = element("input"); branch.id = "expedition-new-branch"; branch.maxLength = 200;
  const path = element("input"); path.id = "expedition-base-path";
  for (const [node, text] of [[base, tr("もとにする branch", "Start from branch")], [branch, tr("あたらしい branch", "New branch")], [path, tr("置き場所（path）", "Base path")]] as const) {
    const label = element("label", undefined, text); label.htmlFor = node.id; fields.append(label, node);
  }
  fields.append(element("p", "hint", tr("じゅんびは ターミナルで", "Prepare your base in the terminal")));
  const rows = element("div", "base-list");
  const warning = element("p", "base-warning"); warning.id = "expedition-base-warning"; warning.setAttribute("role", "status");
  const message = element("p", "hint"); message.setAttribute("role", "status");
  root.append(label, select, fields, rows, warning, message); root.hidden = true;
  let source = "", folderInput = "", info: BaseInfo | undefined, quest: Quest | undefined, generation = 0;
  let defaultPath = "", selected = "";
  const newBase = () => select.value === "__new__";
  const cwd = () => info ? newBase() ? path.value.trim() : select.value : source;
  function changed(): void {
    fields.hidden = !newBase();
    for (const input of [base, branch, path]) input.disabled = !newBase();
    branch.required = path.required = newBase();
    if (newBase()) warning.textContent = "";
    else void warn().catch((error: Error) => { message.textContent = error.message; });
  }
  select.addEventListener("change", changed);
  branch.addEventListener("input", () => {
    if (path.value === defaultPath) path.value = defaultPath = `${info!.defaultParent}/${branch.value.replaceAll("/", "-")}`;
  });
  async function warn(): Promise<boolean> {
    const target = cwd();
    if (!target || newBase()) return false;
    const sessions = await sessionRequest() as Session[];
    if (target !== cwd()) return false;
    const names = sessions.filter((session) => !session.exited && session.cwd.replace(/\/$/, "") === target.replace(/\/$/, "")
      && (heroKind(session.preset) || heroName(session.id))).map((session) => heroName(session.id) ?? session.preset);
    warning.textContent = names.length ? tr(`${names.join("・")}が ここで作業中。同じファイルを変えるかもしれない。新しい拠点をつくる？`, `Working here: ${names.join(", ")}. You may change the same files. Make a new base?`) : "";
    return names.length > 0;
  }
  async function load(folder: string): Promise<void> {
    const request = ++generation; source = folderInput = folder; info = undefined; root.hidden = !folder; message.textContent = "";
    label.hidden = select.hidden = false;
    select.replaceChildren(); rows.replaceChildren(); fields.hidden = true; warning.textContent = "";
    if (!folder) return;
    try {
      const result = await worktreeRequest<BaseInfo>("GET", folder);
      if (request !== generation) return;
      info = result; source = result.cwd;
      select.add(new Option(tr(`この フォルダ — ${source}`, `This folder — ${source}`), source));
      for (const tree of info.worktrees.filter((tree) => !tree.bare && !tree.prunable)) {
        const text = `${tree.branch ?? `HEAD ${tree.head.slice(0, 7)}`} — ${tree.path}`;
        select.add(new Option(text, tree.path));
        const row = element("div", "base-row"), name = element("span", "hint", text);
        row.append(name);
        if (tree !== info.worktrees[0]) {
          const fold = element("button", undefined, tr("たたむ", "Fold")); fold.type = "button";
          fold.addEventListener("click", () => {
            if (!confirm(tr(`${text}\n拠点を たたむ？ branch は のこる。`, `${text}\nFold this base? Its branch stays.`))) return;
            fold.disabled = true;
            void worktreeRequest("DELETE", folder, { path: tree.path }).then(() => load(folder))
              .catch((error: Error) => { message.textContent = error.message; fold.disabled = false; });
          }); row.append(fold);
        }
        rows.append(row);
      }
      select.add(new Option(tr("あたらしい 拠点を つくる", "Make a new base"), "__new__"));
      base.replaceChildren(...info.branches.map((name) => new Option(name, name)));
      base.value = info.current ?? info.branches[0] ?? "";
      branch.value = `yushario/${worktreeSlug(quest?.title ?? "quest")}`;
      path.value = defaultPath = `${info.defaultParent}/${branch.value.replaceAll("/", "-")}`;
      select.value = info.worktrees.some((tree) => tree.path === selected) ? selected : source;
      changed();
    } catch (error) {
      if (request !== generation) return;
      // Non-Git folders keep the ordinary path, including the same-folder warning.
      label.hidden = select.hidden = true;
      try { root.hidden = !await warn(); } catch { root.hidden = true; }
    }
  }
  return {
    load,
    setQuest(value?: Quest) { quest = value; selected = value?.worktreePath ?? ""; },
    async prepare(folder: string): Promise<string> {
      if (folder !== folderInput) await load(folder);
      if (!newBase()) { await warn(); return cwd(); }
      const created = await worktreeRequest<{ path: string; branch: string }>("POST", source, { base: base.value, branch: branch.value.trim(), path: path.value.trim() });
      // A failed launch must not create the same branch again on retry.
      selected = created.path; await load(source); select.value = created.path; changed();
      return created.path;
    },
    branch: () => info?.worktrees.find((tree) => tree.path === cwd())?.branch,
  };
}
