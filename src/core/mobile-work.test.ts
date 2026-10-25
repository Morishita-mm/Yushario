import { describe, expect, it } from "vitest";
import { mobileRequestBodyValues, parseMobileRequestBody } from "./mobile-protocol";
import { mobileResponseBodyValues, parseMobileResponseBody } from "./mobile-display";
import { mobileWorkMovesAgents } from "./mobile-work";

const requestId = "1700000000000.AAAAAAAAAAAAAAAAAAAAAA";
const launch = { baseId: "base-1", presetId: "preset-1", weaponId: null, accessoryId: "acc-1" };
const prepare = { requestId, townId: "town-1", text: " 調べて😀 ", mode: "send", heroId: "hero-1", launch: null };
const member = { heroId: "hero-1", role: "implement", writer: true, ask: "" };
const form = { requestId, questId: "quest-1", text: " 依頼😀 ", members: [member], tactic: "review" };
const embark = { requestId, questId: "quest-1", launch, role: "research", writer: false };
const fit = { tactic: "review", ok: false, gaps: ["reviewer"], inside: ["hero-1"], outside: [] };
const step = { heroId: "hero-1", kind: "request", state: "sent" };
const draft = { questId: "quest-1", townId: "town-1", text: "本文", tactic: "review", members: [member], fits: [fit], editable: true, draftLost: false,
  departure: { state: "partial", steps: [step] } };
const hero = { id: "hero-1", name: "勇者", townId: "town-1", preset: "Claude", weapon: null, accessory: "鎧", busy: false, canTalk: true, active: true, questId: null, permissionGate: false, model: null, effort: "high" };
const choice = { id: "c-1", name: "選択" };
const preset = { id: "preset-1", name: "Claude", weapons: [{ ...choice, model: "opus" }], accessories: [] };
const options = { allowWork: false, heroes: [hero], bases: [{ ...choice, townId: "town-1" }], presets: [preset] };
const many = <T>(count: number, row: (i: number) => T) => Array.from({ length: count }, (_, i) => row(i));

describe("mobile quest work protocol", () => {
  it("accepts exact ID-only bodies and rejects injected paths, commands and fields", () => {
    const valid = { "quest-options": { townId: "town-1" }, "quest-draft": { questId: "quest-1" }, "quest-prepare": prepare,
      "quest-form": form, "quest-embark": embark, "quest-depart": { requestId, questId: "quest-1" } };
    for (const [operation, body] of Object.entries(valid)) {
      expect(parseMobileRequestBody(operation, body)).toEqual({ operation, body });
      for (const extra of [{ cwd: "/private/repo" }, { command: "rm -rf /" }, { session: "terminal-1" }]) {
        expect(parseMobileRequestBody(operation, { ...body, ...extra })).toBeUndefined();
      }
    }
    expect(parseMobileRequestBody("quest-embark", { ...embark, launch: { ...launch, path: "/bin/sh" } })).toBeUndefined();
    expect(parseMobileRequestBody("quest-embark", { ...embark, launch: { baseId: "b", presetId: "p", weaponId: null } })).toBeUndefined();
    expect(parseMobileRequestBody("quest-form", { ...form, members: [{ ...member, cwd: "/repo" }] })).toBeUndefined();
    expect(parseMobileRequestBody("quest-form", { ...form, members: [{ ...member, session: "s" }] })).toBeUndefined();
  });

  it("bounds text, IDs, enums and member counts", () => {
    for (const patch of [{ text: " \n" }, { text: "" }, { text: "x".repeat(8001) }, { text: "\ud800" }, { townId: "" },
      { townId: "x".repeat(201) }, { requestId: "uuid" }, { mode: "auto" }, { heroId: "" }]) {
      expect(parseMobileRequestBody("quest-prepare", { ...prepare, ...patch })).toBeUndefined();
    }
    expect(parseMobileRequestBody("quest-prepare", { ...prepare, text: "x".repeat(8000) })).toBeDefined();
    expect(parseMobileRequestBody("quest-form", { ...form, members: many(16, i => ({ ...member, heroId: `h${i}`, ask: "a".repeat(8000) })) })).toBeDefined();
    for (const patch of [{ members: many(17, i => ({ ...member, heroId: `h${i}` })) }, { members: [member, member] },
      { members: [{ ...member, ask: "a".repeat(8001) }] }, { members: [{ ...member, role: "owner" }] },
      { members: [{ ...member, writer: "yes" }] }, { tactic: "auto" }, { members: {} },
      { text: " " }, { text: "x".repeat(8001) }, { text: undefined }]) {
      expect(parseMobileRequestBody("quest-form", { ...form, ...patch })).toBeUndefined();
    }
    expect(parseMobileRequestBody("quest-embark", { ...embark, role: "lead" })).toBeUndefined();
    expect(parseMobileRequestBody("quest-embark", { ...embark, launch: null })).toBeUndefined();
  });

  it("keeps hero and launch exclusive and launches only when sending", () => {
    expect(parseMobileRequestBody("quest-prepare", { ...prepare, heroId: null, launch })).toBeDefined();
    expect(parseMobileRequestBody("quest-prepare", { ...prepare, launch })).toBeUndefined();
    for (const mode of ["only", "party"]) {
      expect(parseMobileRequestBody("quest-prepare", { ...prepare, mode, heroId: null, launch })).toBeUndefined();
    }
    expect(parseMobileRequestBody("quest-prepare", { ...prepare, heroId: null })).toBeDefined();
  });

  it("marks every agent-moving request for OS authentication", () => {
    const moves = (operation: string, body: object) => mobileWorkMovesAgents(parseMobileRequestBody(operation, body)!);
    expect(moves("quest-prepare", prepare)).toBe(true);
    expect(moves("quest-prepare", { ...prepare, heroId: null, launch })).toBe(true);
    expect(moves("quest-prepare", { ...prepare, heroId: null })).toBe(false);
    expect(moves("quest-prepare", { ...prepare, mode: "only" })).toBe(true);
    expect(moves("quest-prepare", { ...prepare, mode: "party" })).toBe(true);
    expect(moves("quest-embark", embark)).toBe(true);
    expect(moves("quest-depart", { requestId, questId: "q" })).toBe(true);
    expect(moves("quest-form", form)).toBe(true);
    expect(moves("quest-form", { ...form, members: [] })).toBe(false);
    expect(moves("quest-form", { ...form, members: [{ ...form.members[0], role: "command" }] })).toBe(true);
    expect(moves("quest-options", { townId: "t" })).toBe(false);
    expect(mobileWorkMovesAgents({ operation: "status", body: {} })).toBe(false);
  });

  it("signs every field in fixed array order", () => {
    const lv = ["base-1", "preset-1", null, "acc-1"];
    const mv = ["hero-1", "implement", true, ""];
    for (const [op, body, values] of [
      ["quest-options", { townId: "t" }, ["t"]], ["quest-draft", { questId: "q" }, ["q"]],
      ["quest-prepare", prepare, [requestId, "town-1", " 調べて😀 ", "send", "hero-1", null]],
      ["quest-prepare", { ...prepare, heroId: null, launch }, [requestId, "town-1", " 調べて😀 ", "send", null, lv]],
      ["quest-form", form, [requestId, "quest-1", " 依頼😀 ", [mv], "review"]],
      ["quest-embark", embark, [requestId, "quest-1", lv, "research", false]],
      ["quest-depart", { requestId, questId: "q" }, [requestId, "q"]],
    ] as const) expect(mobileRequestBodyValues(parseMobileRequestBody(op, body)!)).toEqual(values);
    const dv = ["quest-1", "本文", "review", [mv], [["review", false, ["reviewer"], ["hero-1"], []]], true, false,
      ["partial", [["hero-1", "request", "sent"]]], "town-1"];
    for (const [op, body, values] of [
      ["quest-options", options, [false, [["hero-1", "勇者", "Claude", null, "鎧", false, true, true, null, false, "town-1", null, "high"]], [["c-1", "選択", "town-1"]],
        [["preset-1", "Claude", [["c-1", "選択", "opus"]], []]]]],
      ["quest-draft", { draft }, [dv]], ["quest-form", { draft }, [dv]], ["quest-depart", { draft }, [dv]],
      ["quest-prepare", { draft, heroId: null, delivery: "none" }, [dv, null, "none"]],
      ["quest-embark", { draft, heroId: "hero-2" }, [dv, "hero-2"]],
    ] as const) expect(mobileResponseBodyValues(parseMobileResponseBody(op, body)!)).toEqual(values);
  });

  it("rejects private metadata, unknown states and oversized response lists", () => {
    const bad = [
      ["quest-options", { ...options, heroes: [{ ...hero, cwd: "/repo" }] }],
      ["quest-options", { ...options, heroes: many(17, i => ({ ...hero, id: `h${i}` })) }],
      ["quest-options", { ...options, heroes: [hero, hero] }],
      ["quest-options", { ...options, bases: many(101, i => ({ id: `b${i}`, name: "b" })) }],
      ["quest-options", { ...options, presets: many(9, i => ({ ...preset, id: `p${i}` })) }],
      ["quest-options", { ...options, presets: [{ ...preset, weapons: many(101, i => ({ id: `w${i}`, name: "w" })) }] }],
      ["quest-options", { ...options, presets: [{ ...preset, command: "claude --dangerously" }] }],
      ["quest-options", { ...options, allowWork: "yes" }],
      ["quest-options", { ...options, heroes: [{ ...hero, permissionGate: null }] }],
      ["quest-draft", { draft: { ...draft, cwd: "/repo" } }],
      ["quest-draft", { draft: { ...draft, text: "x".repeat(8001) } }],
      ["quest-draft", { draft: { ...draft, fits: [fit, fit] } }],
      ["quest-draft", { draft: { ...draft, fits: [{ ...fit, tactic: "auto" }] } }],
      ["quest-draft", { draft: { ...draft, departure: { state: "running", steps: [] } } }],
      ["quest-draft", { draft: { ...draft, departure: { state: "partial", steps: many(18, () => step) } } }],
      ["quest-draft", { draft: { ...draft, departure: { state: "partial", steps: [{ ...step, state: "done" }] } } }],
      ["quest-draft", { draft: { ...draft, departure: { state: "partial", steps: [], branch: "secret" } } }],
      ["quest-prepare", { draft, heroId: null, delivery: "maybe" }],
      ["quest-prepare", { draft, delivery: "none" }],
      ["quest-embark", { draft, heroId: null }],
    ] as const;
    for (const [op, body] of bad) expect(parseMobileResponseBody(op, body), JSON.stringify(body).slice(0, 80)).toBeUndefined();
    expect(parseMobileResponseBody("quest-draft", { draft: { ...draft, departure: { state: "complete", steps: many(17, () => step) } } })).toBeDefined();
    expect(parseMobileResponseBody("quest-draft", { draft: { ...draft, text: "", members: [], fits: [] } })).toBeDefined();
  });

  it("keeps the earlier quest operations unchanged", () => {
    expect(parseMobileRequestBody("status", {})).toEqual({ operation: "status", body: {} });
    expect(parseMobileRequestBody("status", { townId: "t" })).toBeUndefined();
    expect(parseMobileRequestBody("quest-create", { requestId, townId: "t", title: "題", purpose: "" })).toBeDefined();
  });
});
