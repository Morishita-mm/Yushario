import { afterEach, describe, expect, it, vi } from "vitest";
import { PermissionWaiter, PERMISSION_TIMEOUT_MS } from "./permissions";

// Node timer/Promise ownership exception; pure content, decision and scope rules live in core.
const request = { type: "permission" as const, terminal: "t1", id: "first", tool: "Bash", summary: "Bash: date", content: "date", omitted: 0, expiresAt: Date.now() + PERMISSION_TIMEOUT_MS };
afterEach(() => vi.useRealTimers());

describe("PermissionWaiter timer ownership", () => {
  it.each(["allow", "deny", "terminal"] as const)("settles and removes the matching ID for %s", async (decision) => {
    const waiter = new PermissionWaiter(), result = waiter.wait(request, true);
    expect(waiter.decide("stale", decision)).toBe(false);
    expect(waiter.decide(request.id, decision)).toBe(true);
    expect(await result).toBe(decision);
    expect(waiter.pending).toEqual([]);
    expect(waiter.decide(request.id, decision)).toBe(false);
  });
  it("returns to the terminal without a connection", async () => {
    const waiter = new PermissionWaiter();
    expect(await waiter.wait(request, false)).toBe("terminal");
    expect(waiter.pending).toEqual([]);
  });
  it("keeps independent deadlines and clears every timer on disconnect", async () => {
    vi.useFakeTimers();
    const waiter = new PermissionWaiter(), now = Date.now();
    const first = waiter.wait({ ...request, expiresAt: now + PERMISSION_TIMEOUT_MS }, true);
    const second = waiter.wait({ ...request, id: "second", expiresAt: now + PERMISSION_TIMEOUT_MS + 1000 }, true);
    await vi.advanceTimersByTimeAsync(PERMISSION_TIMEOUT_MS);
    expect(await first).toBe("terminal");
    expect(waiter.pending.map((item) => item.id)).toEqual(["second"]);
    waiter.cancel();
    expect(await second).toBe("terminal");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("finishes the Promise when observed progress releases its request", async () => {
    const waiter = new PermissionWaiter(), result = waiter.wait(request, true);
    waiter.observe({ state: "success", hook: "Stop", terminal: "t1", source: "claude-code" });
    expect(await result).toBe("terminal");
    expect(waiter.pending).toEqual([]);
  });
});
