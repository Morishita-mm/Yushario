// Quest work responses: exact shapes, bounds and the fixed signed value arrays.
import { mobileObject, mobileText } from "./mobile-protocol";
import {
  MOBILE_TACTICS, MOBILE_WORK_MEMBERS, MOBILE_WORK_TEXT, isMobileFormMember, mobileFormMemberValues,
  mobileId, mobileNullableId, mobileOneOf, mobileRows,
  type MobileChoice, type MobileWorkDraft, type MobileWorkFit, type MobileWorkHero, type MobileWorkPreset, type MobileWorkStep,
} from "./mobile-work";

export type MobileDelivery = "none" | "sent" | "held";
export type MobileWorkResponseBody =
  | { operation: "quest-options"; body: { allowWork: boolean; heroes: MobileWorkHero[]; bases: MobileChoice[]; presets: MobileWorkPreset[] } }
  | { operation: "quest-draft" | "quest-form" | "quest-depart"; body: { draft: MobileWorkDraft } }
  | { operation: "quest-prepare"; body: { draft: MobileWorkDraft; heroId: string | null; delivery: MobileDelivery } }
  | { operation: "quest-embark"; body: { draft: MobileWorkDraft; heroId: string } };

// A lead plus up to 16 helpers may each have one step.
export const MOBILE_WORK_STEPS = 17;

const label = (value: unknown): value is string => mobileText(value, 200);
const byId = (row: { id: string }) => row.id;

function isChoice(value: unknown): value is MobileChoice {
  return mobileObject(value, ["id", "name"]) && mobileId(value.id) && label(value.name);
}
function isPreset(value: unknown): value is MobileWorkPreset {
  return mobileObject(value, ["id", "name", "weapons", "accessories"]) && mobileId(value.id) && label(value.name)
    && mobileRows(value.weapons, 100, isChoice, byId) && mobileRows(value.accessories, 100, isChoice, byId);
}
function isHero(value: unknown): value is MobileWorkHero {
  return mobileObject(value, ["id", "name", "preset", "weapon", "accessory", "busy", "canTalk", "active", "questId", "permissionGate"])
    && mobileId(value.id) && label(value.name) && label(value.preset)
    && (value.weapon === null || label(value.weapon)) && (value.accessory === null || label(value.accessory))
    && typeof value.busy === "boolean" && typeof value.canTalk === "boolean" && typeof value.active === "boolean"
    && mobileNullableId(value.questId) && typeof value.permissionGate === "boolean";
}
function ids(value: unknown): value is string[] {
  return mobileRows(value, MOBILE_WORK_MEMBERS, mobileId, id => id);
}
function isFit(value: unknown): value is MobileWorkFit {
  return mobileObject(value, ["tactic", "ok", "gaps", "inside", "outside"]) && mobileOneOf(value.tactic, MOBILE_TACTICS)
    && typeof value.ok === "boolean" && ids(value.gaps) && ids(value.inside) && ids(value.outside);
}
function isStep(value: unknown): value is MobileWorkStep {
  return mobileObject(value, ["heroId", "kind", "state"]) && mobileId(value.heroId)
    && mobileOneOf(value.kind, ["request", "ask", "research"] as const)
    && mobileOneOf(value.state, ["pending", "sent", "held", "deferred", "unknown"] as const);
}
export function isMobileWorkDraft(value: unknown): value is MobileWorkDraft {
  return mobileObject(value, ["questId", "text", "tactic", "members", "fits", "editable", "draftLost", "departure"])
    && mobileId(value.questId) && mobileText(value.text, MOBILE_WORK_TEXT, true) && mobileOneOf(value.tactic, MOBILE_TACTICS)
    && mobileRows(value.members, MOBILE_WORK_MEMBERS, isMobileFormMember, member => member.heroId)
    && mobileRows(value.fits, MOBILE_TACTICS.length, isFit, fit => fit.tactic)
    && typeof value.editable === "boolean" && typeof value.draftLost === "boolean"
    && mobileObject(value.departure, ["state", "steps"])
    && mobileOneOf(value.departure.state, ["not-started", "partial", "complete", "uncertain"] as const)
    && mobileRows(value.departure.steps, MOBILE_WORK_STEPS, isStep);
}

export function parseMobileWorkResponse(operation: unknown, body: unknown): MobileWorkResponseBody | undefined {
  switch (operation) {
    case "quest-options":
      if (mobileObject(body, ["allowWork", "heroes", "bases", "presets"]) && typeof body.allowWork === "boolean"
        && mobileRows(body.heroes, MOBILE_WORK_MEMBERS, isHero, byId) && mobileRows(body.bases, 100, isChoice, byId)
        && mobileRows(body.presets, 8, isPreset, byId)) {
        return { operation, body: { allowWork: body.allowWork, heroes: body.heroes, bases: body.bases, presets: body.presets } };
      }
      break;
    case "quest-draft": case "quest-form": case "quest-depart":
      if (mobileObject(body, ["draft"]) && isMobileWorkDraft(body.draft)) return { operation, body: { draft: body.draft } };
      break;
    case "quest-prepare":
      if (mobileObject(body, ["draft", "heroId", "delivery"]) && isMobileWorkDraft(body.draft) && mobileNullableId(body.heroId)
        && mobileOneOf(body.delivery, ["none", "sent", "held"] as const)) {
        return { operation, body: { draft: body.draft, heroId: body.heroId, delivery: body.delivery } };
      }
      break;
    case "quest-embark":
      if (mobileObject(body, ["draft", "heroId"]) && isMobileWorkDraft(body.draft) && mobileId(body.heroId)) {
        return { operation, body: { draft: body.draft, heroId: body.heroId } };
      }
  }
}

export function mobileChoiceValues(value: MobileChoice): unknown[] {
  return [value.id, value.name];
}
export function mobileWorkPresetValues(value: MobileWorkPreset): unknown[] {
  return [value.id, value.name, value.weapons.map(mobileChoiceValues), value.accessories.map(mobileChoiceValues)];
}
export function mobileWorkHeroValues(value: MobileWorkHero): unknown[] {
  return [value.id, value.name, value.preset, value.weapon, value.accessory, value.busy, value.canTalk, value.active, value.questId, value.permissionGate];
}
export function mobileWorkFitValues(value: MobileWorkFit): unknown[] {
  return [value.tactic, value.ok, value.gaps, value.inside, value.outside];
}
export function mobileWorkStepValues(value: MobileWorkStep): unknown[] {
  return [value.heroId, value.kind, value.state];
}
export function mobileWorkDraftValues(value: MobileWorkDraft): unknown[] {
  return [value.questId, value.text, value.tactic, value.members.map(mobileFormMemberValues), value.fits.map(mobileWorkFitValues),
    value.editable, value.draftLost, [value.departure.state, value.departure.steps.map(mobileWorkStepValues)]];
}

export function mobileWorkResponseValues(response: MobileWorkResponseBody): unknown[] {
  switch (response.operation) {
    case "quest-options": {
      const body = response.body;
      return [body.allowWork, body.heroes.map(mobileWorkHeroValues), body.bases.map(mobileChoiceValues), body.presets.map(mobileWorkPresetValues)];
    }
    case "quest-draft": case "quest-form": case "quest-depart": return [mobileWorkDraftValues(response.body.draft)];
    case "quest-prepare": return [mobileWorkDraftValues(response.body.draft), response.body.heroId, response.body.delivery];
    case "quest-embark": return [mobileWorkDraftValues(response.body.draft), response.body.heroId];
  }
}
