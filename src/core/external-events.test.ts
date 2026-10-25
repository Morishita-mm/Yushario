import { describe, expect, it } from "vitest";
import { admitExternalEvent, EXTERNAL_AGENT_LIMIT, EXTERNAL_EVENT_LIMIT, EXTERNAL_EVENT_WINDOW_MS,
  hookEventForTerminal, type ExternalEventBudget } from "./hook-trust";
import { LIVE_HELPER_LIMIT, Room } from "./room";
import type { AgentEvent } from "./events";

function external(agent: string, fields: Partial<AgentEvent> = {}): AgentEvent {
  return hookEventForTerminal({ state: "working", agent, ...fields });
}

describe("external event admission", () => {
  it("shares the rate budget across claimed identities and does not mutate prior state", () => {
    let budget: ExternalEventBudget | undefined;
    for (let i = 0; i < EXTERNAL_EVENT_LIMIT; i++) {
      budget = admitExternalEvent(budget, `external:${i}`, 100);
      expect(budget).toBeDefined();
    }
    const snapshot = structuredClone(budget);
    expect(admitExternalEvent(budget, "external:another", 100)).toBeUndefined();
    expect(admitExternalEvent(budget, "external:0", 100 + EXTERNAL_EVENT_WINDOW_MS - 1)).toBeUndefined();
    expect(admitExternalEvent(budget, "external:0", 99)).toBeUndefined();
    expect(budget).toEqual(snapshot);
    expect(admitExternalEvent(budget, "external:0", 100 + EXTERNAL_EVENT_WINDOW_MS)?.count).toBe(1);
  });

  it("bounds distinct IDs across time windows while allowing known IDs to return", () => {
    let budget: ExternalEventBudget | undefined;
    for (let i = 0; i < EXTERNAL_AGENT_LIMIT; i++) {
      budget = admitExternalEvent(budget, `external:${i}`, i * EXTERNAL_EVENT_WINDOW_MS);
    }
    expect(budget?.agents).toHaveLength(EXTERNAL_AGENT_LIMIT);
    const later = (EXTERNAL_AGENT_LIMIT + 1) * EXTERNAL_EVENT_WINDOW_MS;
    expect(admitExternalEvent(budget, "external:overflow", later)).toBeUndefined();
    const returning = admitExternalEvent(budget, "external:0", later);
    expect(returning?.agents).toHaveLength(EXTERNAL_AGENT_LIMIT);
    expect(returning?.count).toBe(1);
  });

  it("bounds a 5000-ID flood without removing an authenticated hero", () => {
    const room = new Room();
    const trusted = room.apply({ state: "idle", agent: "trusted", terminal: "pty" }, 0);
    let budget: ExternalEventBudget | undefined;
    for (let i = 0; i < 5000; i++) {
      const event = external(String(i));
      const next = admitExternalEvent(budget, event.agent!, i * EXTERNAL_EVENT_WINDOW_MS);
      if (!next) continue;
      budget = next;
      room.apply(event, i);
    }
    expect(room.agents.size).toBe(EXTERNAL_AGENT_LIMIT + 1);
    expect(room.agents.get("trusted")).toBe(trusted);
    expect(trusted?.terminal).toBe("pty");
    // Ending a displayed hero must not recycle the server's lifetime ID budget.
    room.apply(external("0", { hook: "SessionEnd" }), 6000);
    expect(admitExternalEvent(budget, "external:new", 6000 * EXTERNAL_EVENT_WINDOW_MS)).toBeUndefined();
    const next = admitExternalEvent(budget, "external:0", 6000 * EXTERNAL_EVENT_WINDOW_MS);
    expect(next).toBeDefined();
    room.apply(external("0", { hook: "SessionStart" }), 6001);
    expect(room.agents.size).toBe(EXTERNAL_AGENT_LIMIT + 1);
  });
});

describe("live helper limit", () => {
  it.each([false, true])("bounds helper floods (authenticated=%s)", (authenticated) => {
    const room = new Room();
    const event = (id: string, hook = "SubagentStart", extra: Partial<AgentEvent> = {}): AgentEvent => {
      const input: AgentEvent = { state: "working", agent: "hero", hook, subagent: { id }, ...extra };
      return hookEventForTerminal(input, authenticated ? "pty" : undefined);
    };
    for (let i = 0; i < 5000; i++) room.apply(event(String(i)), i);
    const hero = room.agents.get(authenticated ? "hero" : "external:hero")!;
    expect(hero.helpers).toHaveLength(LIVE_HELPER_LIMIT);
    expect(hero.helpers.some((helper) => helper.id === "4999")).toBe(false);
    room.apply(event("0", "PreToolUse", { tool: "Read", target: "updated.ts" }), 6000);
    expect(hero.helpers.find((helper) => helper.id === "0")?.target).toBe("updated.ts");
    // A stale stop cannot remove an existing helper, even when the array is full.
    room.apply(event("0", "SubagentStop"), 1);
    expect(hero.helpers).toHaveLength(LIVE_HELPER_LIMIT);
    room.apply(event("0", "SubagentStop"), 6001);
    expect(hero.helpers).toHaveLength(LIVE_HELPER_LIMIT - 1);
    room.apply(event("new"), 6002);
    expect(hero.helpers).toHaveLength(LIVE_HELPER_LIMIT);
    expect(hero.helpers.some((helper) => helper.id === "new")).toBe(true);
    room.apply(hookEventForTerminal({ state: "idle", agent: "hero", hook: "SessionEnd" }, authenticated ? "pty" : undefined), 6003);
    expect(room.agents.size).toBe(0);
  });
});
