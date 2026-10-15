import { describe, expect, it } from "vitest";
import { canRecallHero, hookEventForTerminal } from "./hook-trust";
import type { AgentEvent } from "./events";

describe("hook trust", () => {
  const event: AgentEvent = { state: "working", agent: "hero", terminal: "victim", branch: "main", source: "claude-code", command: "npm test", text: "Visible" };
  it("keeps external observations visible without terminal, evidence input or a shared hero ID", () => {
    expect(hookEventForTerminal(event)).toEqual({ state: "working", agent: "external:hero", source: "claude-code", text: "Visible" });
    expect(event.terminal).toBe("victim");
  });
  it("takes the terminal from the verified credential, never from the body", () => {
    expect(hookEventForTerminal(event, "sender")).toEqual({ ...event, terminal: "sender" });
  });
  it("allows only the human-requested recall of the same hero after its old terminal ended", () => {
    expect(canRecallHero("hero", "hero", true)).toBe(true);
    expect(canRecallHero(undefined, "hero", true)).toBe(false);
    expect(canRecallHero("other", "hero", true)).toBe(false);
    expect(canRecallHero("hero", "hero", false)).toBe(false);
    expect(canRecallHero(undefined, undefined, true)).toBe(false);
  });
});
