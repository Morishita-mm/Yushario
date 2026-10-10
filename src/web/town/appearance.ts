import { THEME_NAMES, type TownTheme } from "./themes";

const key = (project: string) => `agent-quest:town:${project}`;
export function appearance(project: string): TownTheme | undefined {
  try {
    const value = localStorage.getItem(key(project));
    return value && Object.hasOwn(THEME_NAMES, value) ? value as TownTheme : undefined;
  } catch { return undefined; }
}
export function saveAppearance(project: string, theme: TownTheme): void {
  try { localStorage.setItem(key(project), theme); } catch { /* Storage may be disabled. */ }
}
export function heroVariant(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 5;
}
export function heroAccent(id: string): string {
  return ["#4d9be6", "#1ebc73", "#a884f3", "#30e1b9", "#ea4f36"][heroVariant(id)];
}
