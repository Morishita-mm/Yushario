import type { TownSettings } from "../core/town-ledger";

// Kept in sync with the ledger after a successful settings save.
let language: TownSettings["language"] = "auto";
export function setLanguage(value: TownSettings["language"]): void { language = value; }
export function serverLanguage(): "ja" | "en" { return language === "en" ? "en" : "ja"; }
export function tr(ja: string, en: string): string { return serverLanguage() === "ja" ? ja : en; }
