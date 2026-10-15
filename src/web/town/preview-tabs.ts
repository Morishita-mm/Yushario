// One named tab per quest/town. A same-origin page is not enough: notifications
// must come from the exact WindowProxy returned when the person opened this link.
const tabs = new Map<string, { link: string; window: Window }>();
export function openPreview(key: string, link: string, url: string): void {
  const opened = window.open(url, `yushario-preview-${key}`);
  if (opened) tabs.set(key, { link, window: opened }); else tabs.delete(key);
}
export function previewTabMatches(key: string, link: string, source: MessageEventSource | null): boolean {
  const opened = tabs.get(key);
  return Boolean(opened && !opened.window.closed && opened.link === link && source === opened.window);
}
export function forgetPreviewTab(key: string, link?: string): void {
  if (link === undefined || tabs.get(key)?.link === link) tabs.delete(key);
}
