import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { mobileObject, mobileText } from "../../core/mobile-protocol";
import type { MobileWorkDraft, MobileWorkStep } from "../../core/mobile-work";
import { writeMobileState } from "./quest-requests";

type Departure = { questId: string; signature: string; steps: MobileWorkStep[] };
function valid(value: unknown): value is Departure {
  return mobileObject(value, ["questId", "signature", "steps"]) && mobileText(value.questId, 200)
    && typeof value.signature === "string" && /^[a-f0-9]{64}$/.test(value.signature) && Array.isArray(value.steps) && value.steps.length <= 17
    && value.steps.every(step => mobileObject(step, ["heroId", "kind", "state"]) && mobileText(step.heroId, 200)
      && ["request", "ask", "research"].includes(step.kind as string) && ["pending", "sent", "held", "deferred", "unknown"].includes(step.state as string));
}
const accepted = (step: MobileWorkStep): boolean => ["sent", "held", "deferred"].includes(step.state);
// Only delivery metadata is durable. Never persist the draft, helper instructions,
// commands or output outside the existing conversation-retention policy.
export class MobileDepartures {
  private readonly entries = new Map<string, Departure>();
  private readonly interrupted = new Set<string>();
  private readonly formed = new Set<string>();
  constructor(private readonly directory: string) {
    const path = join(directory, "work-departures.json");
    if (!existsSync(path)) return;
    if (statSync(path).size > 4_000_000) throw Error("Invalid departures");
    const saved: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!mobileObject(saved, ["forms", "departures"]) || !Array.isArray(saved.forms) || saved.forms.length > 1000
      || !saved.forms.every(id => mobileText(id, 200)) || !Array.isArray(saved.departures)
      || saved.departures.length > 1000 || !saved.departures.every(valid)) throw Error("Invalid departures");
    for (const id of saved.forms) this.formed.add(id as string);
    for (const item of saved.departures) {
      if (this.entries.has(item.questId)) throw Error("Duplicate departure");
      this.entries.set(item.questId, item);
      if (!item.steps.every(accepted)) this.interrupted.add(item.questId);
    }
  }
  has(quest: string): boolean { return this.entries.has(quest); }
  hadForm(quest: string): boolean { return this.formed.has(quest); }
  markForm(quest: string): void {
    if (!this.formed.has(quest) && this.formed.size >= 1000) throw Error("Too many mobile forms");
    this.formed.add(quest); this.save();
  }
  canContinue(quest: string, signature: string): boolean {
    const entry = this.entries.get(quest);
    return Boolean(entry && entry.signature === signature && !this.interrupted.has(quest)
      && !entry.steps.some(step => step.state === "unknown") && !entry.steps.every(accepted));
  }
  begin(questId: string, signature: string, steps: MobileWorkStep[]): void {
    if (this.entries.has(questId) || this.entries.size >= 1000) throw Error("Departure already started");
    this.entries.set(questId, { questId, signature, steps }); this.save();
  }
  view(quest: string): MobileWorkDraft["departure"] {
    const entry = this.entries.get(quest);
    if (!entry) return { state: "not-started", steps: [] };
    const state = this.interrupted.has(quest) || entry.steps.some(step => step.state === "unknown") ? "uncertain"
      : entry.steps.every(accepted) ? "complete" : "partial";
    return { state, steps: entry.steps.map(step => ({ ...step })) };
  }
  deliver(quest: string, heroId: string, kind: MobileWorkStep["kind"], ready: () => boolean, send: () => boolean): boolean {
    const step = this.entries.get(quest)?.steps.find(step => step.heroId === heroId && step.kind === kind);
    if (!step) throw Error("Unknown departure step");
    if (accepted(step)) return true;
    if (step.state !== "pending" || this.interrupted.has(quest) || !ready()) return false;
    step.state = "unknown"; this.save(); // Before audit/send: an ambiguous crash must never resend.
    try {
      step.state = send() ? "sent" : "held";
      this.save(); return true;
    } catch { step.state = "unknown"; return false; }
  }
  private save(): void { writeMobileState(this.directory, "work-departures.json", { forms: [...this.formed], departures: [...this.entries.values()] }); }
}
