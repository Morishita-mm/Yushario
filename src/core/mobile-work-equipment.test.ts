import { describe, expect, it } from "vitest";
import { mobileModel, mobileEffort, MOBILE_EFFORTS } from "./mobile-work";
import { parseMobileResponseBody, mobileResponseBodyValues } from "./mobile-display";

const hero = { id: "h", name: "勇者", preset: "Claude", weapon: "剣", accessory: "帯", busy: false, canTalk: true,
  active: true, questId: null, permissionGate: true, townId: "t", model: "opus", effort: "high", variant: 2 };
const weapon = { id: "w", name: "剣", model: "opus" }, accessory = { id: "a", name: "帯", effort: "high" };
const preset = { id: "p", name: "Claude", weapons: [weapon], accessories: [accessory] };
const options = { allowWork: false, heroes: [hero], bases: [{ id: "b", name: "拠点", townId: "t" }], presets: [preset] };
const parse = (body: unknown) => parseMobileResponseBody("quest-options", body);
const signed = (body: unknown) => mobileResponseBodyValues(parse(body)!);

describe("A5 equipment display contract", () => {
  it("accepts bounded provider/model identifiers but not arguments, controls, URLs or obvious paths", () => {
    for (const model of ["haiku", "sonnet", "opus", "gpt-5.4", "openai-codex/gpt-6-astra", "Provider:Model-1.0", "X".repeat(64)]) {
      expect(mobileModel(model)).toBe(true);
    }
    for (const model of [null, undefined, "", "X".repeat(65), "--model", "opus --flag", "model\n", "a\u0000", "a\u202e", "モデル", "/private/file",
      "./file", "../file", "provider/../file", "provider:./file", "~/file", "C:/private/file", "C:\\file", "https://host/model", "$(cmd)"]) {
      expect(mobileModel(model), String(model)).toBe(false);
    }
    for (const effort of MOBILE_EFFORTS) expect(mobileEffort(effort)).toBe(true);
    for (const effort of [null, "", "ultra", "HIGH", "high ", "--high", "max/other", "x".repeat(65)]) expect(mobileEffort(effort)).toBe(false);
  });

  it("requires nullable fields only on the right rows and rejects unknown or malformed values", () => {
    expect(parse(options)).toBeDefined();
    expect(parse({ ...options, heroes: [{ ...hero, model: null, effort: null }], presets: [{ ...preset,
      weapons: [{ ...weapon, model: null }], accessories: [{ ...accessory, effort: null }] }] })).toBeDefined();
    for (const model of [undefined, "x".repeat(65), "/private/file", "a b", "https://host/model"]) {
      expect(parse({ ...options, heroes: [{ ...hero, model }] })).toBeUndefined();
      expect(parse({ ...options, presets: [{ ...preset, weapons: [{ ...weapon, model }] }] })).toBeUndefined();
    }
    for (const effort of [undefined, "ultra", "HIGH", "high\n"]) {
      expect(parse({ ...options, heroes: [{ ...hero, effort }] })).toBeUndefined();
      expect(parse({ ...options, presets: [{ ...preset, accessories: [{ ...accessory, effort }] }] })).toBeUndefined();
    }
    expect(parse({ ...options, bases: [{ ...options.bases[0], model: null }] })).toBeUndefined();
    expect(parse({ ...options, presets: [{ ...preset, weapons: [{ ...weapon, effort: "high" }] }] })).toBeUndefined();
    expect(parse({ ...options, presets: [{ ...preset, accessories: [{ ...accessory, model: "opus" }] }] })).toBeUndefined();
  });

  it("signs each model/effort and null without changing base or request shapes", () => {
    const values = signed(options);
    for (const model of ["sonnet", null]) {
      expect(signed({ ...options, heroes: [{ ...hero, model }] })).not.toEqual(values);
      expect(signed({ ...options, presets: [{ ...preset, weapons: [{ ...weapon, model }] }] })).not.toEqual(values);
    }
    for (const effort of ["low", null]) {
      expect(signed({ ...options, heroes: [{ ...hero, effort }] })).not.toEqual(values);
      expect(signed({ ...options, presets: [{ ...preset, accessories: [{ ...accessory, effort }] }] })).not.toEqual(values);
    }
    expect(values[2]).toEqual([["b", "拠点", "t"]]);
  });
});
