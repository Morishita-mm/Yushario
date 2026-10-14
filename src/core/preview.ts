export type PreviewLink = { id: string; quest: string | null; town: string; name: string; url: string };
export type PreviewPage = { url: string; title: string; errors: string[]; count: number };
export type PreviewUrlResult = { ok: true; url: string; origin: string } | { ok: false; reason: "local" | "port" | "self" | "invalid" };

// Deliberately accept only literal loopback hosts, never DNS aliases or URL credentials.
export function previewUrl(input: unknown, ownPort: number): PreviewUrlResult {
  if (typeof input !== "string" || input.length > 4096 || /[\s\x00-\x1f\x7f\\]/.test(input)) return { ok: false, reason: "invalid" };
  const parts = /^(https?):\/\/(localhost|127\.0\.0\.1|\[::1\])(?::([^/?#]*))?([/?#].*)?$/i.exec(input);
  if (!parts) return { ok: false, reason: "local" };
  const protocol = parts[1].toLowerCase(), host = parts[2].toLowerCase();
  const defaultPort = protocol === "https" ? 443 : 80;
  const port = parts[3] === undefined ? defaultPort : /^\d{1,5}$/.test(parts[3]) ? Number(parts[3]) : 0;
  if (port < 1 || port > 65535) return { ok: false, reason: "port" };
  if (port === ownPort) return { ok: false, reason: "self" };
  const origin = `${protocol}://${host}${port === defaultPort ? "" : `:${port}`}`;
  const suffix = parts[4] ?? "/";
  return { ok: true, origin, url: origin + (suffix.startsWith("/") ? suffix : `/${suffix}`) };
}

export function stripPreviewControls(output: string): string {
  return output.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b[@-_]/g, "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, "");
}

export function previewUrls(output: string, ownPort: number): string[] {
  const matches = stripPreviewControls(output).match(/https?:\/\/[^\s<>"'`]+/gi) ?? [];
  const urls: string[] = [];
  for (const match of matches) {
    // Terminal prose commonly wraps a URL in parentheses or ends the sentence with a dot.
    const result = previewUrl(match.replace(/[),.;!]+$/, ""), ownPort);
    if (result.ok && !urls.includes(result.url)) urls.push(result.url);
  }
  return urls;
}

// A PTY may deliver one character at a time. Wait for a complete output line;
// otherwise :5173 would briefly become candidates for :5, :51 and :517.
export function previewOutput(tail: string, data: string, ownPort: number): { tail: string; urls: string[] } {
  const output = tail + data, end = output.lastIndexOf("\n") + 1;
  return { tail: output.slice(end).slice(-8192), urls: end ? previewUrls(output.slice(0, end), ownPort) : [] };
}

export function previewNotice(input: unknown, origin: string, linkedUrl: string, ownPort: number): PreviewPage | undefined {
  const linked = previewUrl(linkedUrl, ownPort);
  if (!linked.ok || linked.origin !== origin || !input || typeof input !== "object") return;
  const data = input as Record<string, unknown>;
  if (data.type !== "yushario-preview" || typeof data.title !== "string" || !Array.isArray(data.errors)
    || !data.errors.every((error) => typeof error === "string")) return;
  const current = previewUrl(data.url, ownPort);
  if (!current.ok || current.origin !== linked.origin) return;
  const errors = (data.errors as string[]).slice(0, 20).map((error) => error.slice(0, 500));
  const count = typeof data.count === "number" && Number.isSafeInteger(data.count) && data.count >= errors.length
    ? Math.min(data.count, 1_000_000) : errors.length;
  return { url: current.url, title: data.title.slice(0, 200), errors, count };
}

export function previewDraft(page: PreviewPage, language: "ja" | "en"): string {
  const text = [language === "en" ? "Please check these preview errors." : "プレビューの エラーを たしかめて。", page.url,
    ...page.errors.map((error, i) => `${i + 1}. ${error}`)].join("\n");
  return text.length <= 8000 ? text : text.slice(0, 7950) + (language === "en" ? "\n… More errors in the preview." : "\n… つづきは プレビューで。");
}
