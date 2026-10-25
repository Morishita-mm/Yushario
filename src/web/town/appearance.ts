import { heroVariant } from "../../core/mobile-hero";
export { heroVariant } from "../../core/mobile-hero";
export function heroAccent(id: string): string {
  return ["#4d9be6", "#1ebc73", "#a884f3", "#30e1b9", "#ea4f36"][heroVariant(id)];
}
