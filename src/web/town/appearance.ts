export function heroVariant(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 5;
}
export function heroAccent(id: string): string {
  return ["#4d9be6", "#1ebc73", "#a884f3", "#30e1b9", "#ea4f36"][heroVariant(id)];
}
