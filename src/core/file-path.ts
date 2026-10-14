import { safeReviewPath } from "./review";
export type Editor = "none" | "vscode" | "cursor";
export type FileReference = { path: string; line?: number };

// Only a whole inline-code span shaped like a filename; prose and commands are left alone.
export function fileReference(text: string): FileReference | undefined {
  const match = /^(.+?)(?::([1-9]\d*)(?::[1-9]\d*)?)?$/.exec(text);
  if (!match) return;
  const path = match[1];
  if (!path.includes("/") && !/^[\w.-]+\.[a-zA-Z0-9]+$/.test(path)) return;
  if (/[\r\n\0]|:\/\/|[<>|?*]/.test(path) || path.startsWith("-")) return;
  return { path, ...(match[2] ? { line: Number(match[2]) } : {}) };
}

export function absoluteFile(cwd: string, path: string): string | undefined {
  const base = cwd.replace(/\/$/, "");
  const relative = path.startsWith(`${base}/`) ? path.slice(base.length + 1) : path;
  if (!base.startsWith("/") || !safeReviewPath(relative)) return;
  return `${base}/${relative}`;
}

export function editorUrl(editor: Editor, absolute: string, line?: number): string | undefined {
  if (editor === "none") return;
  const path = absolute.split("/").map(encodeURIComponent).join("/");
  return `${editor}://file${path}${line ? `:${line}` : ""}`;
}
