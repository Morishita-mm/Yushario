import { describe, expect, it } from "vitest";
import { equipmentArgs, equipmentCommands, equipmentInput, isEquipmentId, parseEquipmentMaster, resolveEquipmentMaster } from "./equipment";

const items = {
  weapons: [{ id: "dagger", name: "たんけん", model: "provider/light" }, { id: "steel", name: "つるぎ", model: "provider/normal" }],
  accessories: [{ id: "low", name: "はちまき", value: "low" }, { id: "high", name: "ためる", value: "high" }],
};
const controls = { modelArg: "--model", thinkingArg: "--thinking", modelCommand: "/model", thinkingCommand: "/thinking" };

describe("equipment master and selection", () => {
  it("replaces an entire agent, preserves other agents and never merges tiers", () => {
    const base = { pi: items, claude: items };
    const override = { pi: { weapons: [items.weapons[0]], accessories: [] } };
    expect(resolveEquipmentMaster(base, override)).toEqual({ ...base, ...override });
    expect(base.pi.weapons).toHaveLength(2);
    expect(resolveEquipmentMaster(base)).toEqual(base);
    expect(() => resolveEquipmentMaster(base, { unknown: items })).toThrow();
  });
  it("accepts empty tiers and unknown model names but rejects malformed or injected values", () => {
    expect(parseEquipmentMaster({ pi: { weapons: [], accessories: [] } }).pi.weapons).toEqual([]);
    expect(parseEquipmentMaster({ pi: items }).pi).toEqual(items);
    for (const value of [null, [], { pi: {} }, { pi: { ...items, weapons: [items.weapons[0], items.weapons[0]] } },
      { pi: { ...items, weapons: [{ ...items.weapons[0], model: "x\n/quit" }] } }]) expect(() => parseEquipmentMaster(value)).toThrow();
  });
  it("uses none as the default and checks IDs against the selected agent", () => {
    expect(equipmentInput({}, items)).toEqual({});
    expect(equipmentInput({ weapon: "steel", accessory: "low" }, items)).toEqual({ weapon: "steel", accessory: "low" });
    for (const value of ["", "../steel", "Steel", "--model", "x\n", "x".repeat(41), null]) expect(isEquipmentId(value)).toBe(false);
    for (const value of [null, [], { weapon: "unknown" }, { weapon: 1 }, { accessory: null }]) expect(() => equipmentInput(value, items)).toThrow();
  });
});

describe("equipment CLI delivery", () => {
  it("passes no arguments for none, and puts model/thinking in separate argv entries", () => {
    expect(equipmentArgs({}, items, controls)).toEqual([]);
    expect(equipmentArgs({ weapon: "steel", accessory: "low" }, items, controls)).toEqual(["--model", "provider/normal", "--thinking", "low"]);
    expect(equipmentArgs({ weapon: "dagger" }, items, { ...controls, modelArg: "-m" })).toEqual(["-m", "provider/light"]);
    expect(() => equipmentArgs({ accessory: "low" }, items, { ...controls, thinkingArg: "" })).toThrow();
  });
  it("reapplies thinking after a model change, emits nothing for unchanged gear", () => {
    const current = { weapon: "dagger", accessory: "low" };
    expect(equipmentCommands(current, { weapon: "steel", accessory: "low" }, items, controls)).toEqual(["/model provider/normal", "/thinking low"]);
    expect(equipmentCommands(current, current, items, controls)).toEqual([]);
    expect(equipmentCommands(current, { ...current, accessory: "high" }, items, controls)).toEqual(["/thinking high"]);
  });
  it("refuses mid-session removal and unsupported commands", () => {
    expect(() => equipmentCommands({ weapon: "steel" }, {}, items, controls)).toThrow("そうびなし");
    expect(() => equipmentCommands({}, { weapon: "steel" }, items, { ...controls, modelCommand: "" })).toThrow("途中");
    expect(() => equipmentCommands({}, { accessory: "low" }, items, { ...controls, thinkingCommand: "" })).toThrow("途中");
  });
});
