import { afterEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { permissionSummary, type Permission } from "../../core/permissions";
import { permissionChange } from "../../core/permission-change";
import { mobilePermissionCanAllow, type MobilePermissionDetails } from "../../core/mobile-permission";
import { mobilePermissionHashInput, type MobilePermission } from "../../core/mobile-display";
import { mobileHash } from "./crypto";
import { GatewayFixture, type TestPhone } from "./test-client";
import { startRelay, stopAll, pairPhone, screen, launchOnMac, ok, rejected, until, type FakeLaunch, type Relay } from "./security-work-fixture";

let fixture: GatewayFixture | undefined;
afterEach(async () => { await stopAll(); await fixture?.close(); fixture = undefined; });
function hook(tool_name: string, tool_input: object) { return { hook_event_name: "PermissionRequest", tool_name, tool_input }; }
function waiting(tool: string, fields: object, id = "p", work: MobilePermissionDetails["work"] = null) {
  const input = hook(tool, fields), summary = permissionSummary(input)!;
  const card: Permission = { ...summary, type: "permission", id, terminal: "terminal", agent: "hero", expiresAt: Date.now() + 120000 };
  const details: MobilePermissionDetails = { work, change: permissionChange(input, card.content.length) };
  const done = fixture!.permissions.wait(card, true, details);
  return { card, details, done };
}
async function list(phone: TestPhone): Promise<MobilePermission[]> {
  const result = await fixture!.post(phone.packet("permissions"));
  expect(result.status).toBe(200);
  expect(Buffer.byteLength(result.text)).toBeLessThan(1048576);
  const packet = JSON.parse(result.text);
  expect(Buffer.from(packet.ciphertext, "base64url").length).toBeLessThanOrEqual(524288);
  const response = phone.open(packet);
  if (response.operation !== "permissions") throw Error("Unexpected response");
  return response.body.permissions;
}
async function decision(phone: TestPhone, card: MobilePermission, decision: "allow" | "deny", status: number) {
  const result = await fixture!.post(phone.packet("decide", { permissionId: card.id, contentHash: card.contentHash, decision }));
  expect(result.status).toBe(status);
  if (status === 400) expect(result.text).toBe('{"error":"rejected"}');
}
// The fake agent writes its answer with a non-atomic writeFileSync, so the file can exist before its JSON is complete.
async function hookDecision(path: string): Promise<string> {
  let behavior = "";
  await until(() => {
    if (!existsSync(path)) return false;
    try { behavior = JSON.parse(readFileSync(path, "utf8")).hookSpecificOutput.decision.behavior; return true; } catch { return false; }
  });
  return behavior;
}
function trigger(relay: Relay, launch: FakeLaunch, input: object) {
  const base = join(relay.log, `${launch.name}-${launch.pid}`);
  writeFileSync(base + ".permission-input", JSON.stringify(input));
  process.kill(launch.pid, "SIGUSR2");
  return base + ".permission-result";
}

describe("SEC-25 permission task/body binding over real HTTP and crypto", () => {
  it("uses the authenticated terminal's quest snapshot, never another hero/town or supplied cwd/session_id", async () => {
    const relay = await startRelay(), phone = await pairPhone(relay);
    const rows: { launch: FakeLaunch; quest: any; agent: string; result: string }[] = [];
    for (let i = 0; i < 3; i++) {
      const launch = await launchOnMac(relay, "claude", i === 2 ? relay.towns.other : relay.towns.git);
      const session = (await screen(relay, "/sessions")).json.find((s: any) => s.id === launch.terminal);
      const quest = (await screen(relay, "/quests", "POST", { town: session.project, title: `作業-${i}`, purpose: "" })).json;
      expect((await screen(relay, `/quests/${quest.id}/assign`, "POST", { session: launch.terminal })).status).toBe(200);
      rows.push({ launch, quest, agent: session.hero, result: "" });
    }
    for (const [i, row] of rows.entries()) {
      row.result = trigger(relay, row.launch, { ...hook("Write", { file_path: `file-${i}.ts`, content: `BODY-${i}` }),
        session_id: rows[(i + 1) % 3].agent, cwd: "/private/FOREIGN_CWD", branch: "FOREIGN_BRANCH" });
      await until(async () => (await screen(relay, `/quests/${row.quest.id}`)).json.state === "waiting");
    }
    const cards = (await ok(relay, phone, "permissions", {})).permissions as MobilePermission[];
    expect(cards).toHaveLength(3);
    for (const [i, row] of rows.entries()) {
      const card = cards.find(card => card.heroId === row.agent)!;
      expect(card.work).toEqual({ questId: row.quest.id, title: `作業-${i}` });
      expect(card.change).toEqual({ kind: "write", text: `BODY-${i}`, omitted: 0 });
      expect(card.content).toBe(`file-${i}.ts`);
    }
    expect(cards.find(c => c.heroId === rows[0].agent)!.townId).toBe(cards.find(c => c.heroId === rows[1].agent)!.townId);
    expect(cards.find(c => c.heroId === rows[0].agent)!.townId).not.toBe(cards.find(c => c.heroId === rows[2].agent)!.townId);
    const original = cards.find(c => c.heroId === rows[0].agent)!;
    // A later reassignment must not rewrite the reason this outstanding permission was raised.
    await screen(relay, `/quests/${rows[1].quest.id}/assign`, "POST", { session: rows[0].launch.terminal });
    expect((await ok(relay, phone, "permissions", {})).permissions.find((c: any) => c.id === original.id).work).toEqual(original.work);
    for (const altered of [{ ...original, work: { questId: rows[2].quest.id, title: "作業-2" } },
      { ...original, change: { kind: "write" as const, text: "DIFFERENT BODY", omitted: 0 } }]) {
      await rejected(relay, phone, "decide", { permissionId: original.id,
        contentHash: mobileHash(mobilePermissionHashInput(altered)).toString("base64url"), decision: "allow" });
    }
    for (const card of cards) await ok(relay, phone, "decide", { permissionId: card.id, contentHash: card.contentHash, decision: "deny" });
    for (const row of rows) {
      expect(await hookDecision(row.result)).toBe("deny");
    }
    const fresh = await launchOnMac(relay, "claude", relay.towns.git);
    const result = trigger(relay, fresh, hook("Edit", { file_path: "unknown.ts", old_string: "before", new_string: "after" }));
    // This hero has no request or quest; no nearest quest/title fallback is permitted.
    await until(async () => (await screen(relay, "/sessions")).json.find((s: any) => s.id === fresh.terminal)?.hero);
    let unknown: MobilePermission | undefined;
    await until(async () => { unknown = (await ok(relay, phone, "permissions", {})).permissions[0]; return Boolean(unknown); });
    expect(unknown!.work).toBeNull();
    await ok(relay, phone, "decide", { permissionId: unknown!.id, contentHash: unknown!.contentHash, decision: "allow" });
    expect(await hookDecision(result)).toBe("allow");
    const wire = JSON.stringify(cards);
    for (const privateValue of [relay.root, "FOREIGN_", "cwd", "branch", "purpose"]) expect(wire).not.toContain(privateValue);
  }, 20000);

  it("returns literal Write/Edit/MultiEdit/Bash inputs and rejects stale hashes after any body change", async () => {
    fixture = await new GatewayFixture().listen(); const phone = await fixture.pair();
    const write = waiting("Write", { file_path: "a", content: "\u0000\u202e\\u000a\n\t😀" }, "write", { questId: "q", title: "題" });
    waiting("Edit", { file_path: "b", old_string: "old", new_string: "new", replace_all: true }, "edit");
    waiting("MultiEdit", { file_path: "c", edits: [{ old_string: "x", new_string: "y" }, { old_string: "y", new_string: "z", replace_all: true }] }, "multi");
    waiting("Bash", { command: "printf 'full command'\n" }, "bash");
    const cards = await list(phone), byId = (id: string) => cards.find(card => card.id === id)!;
    expect(byId("write").change).toEqual(write.details.change);
    expect(byId("edit").change).toEqual({ kind: "edit", edits: [{ before: "old", after: "new", replaceAll: true }], omitted: 0, omittedEdits: 0 });
    expect(byId("multi").change).toEqual({ kind: "edit", edits: [{ before: "x", after: "y", replaceAll: false }, { before: "y", after: "z", replaceAll: true }], omitted: 0, omittedEdits: 0 });
    expect(byId("bash")).toMatchObject({ content: "printf 'full command'\n", change: null });
    write.details.change = { kind: "write", text: "changed after display", omitted: 0 };
    await decision(phone, byId("write"), "allow", 400);
    const refreshed = (await list(phone)).find(card => card.id === "write")!;
    expect(refreshed.contentHash).not.toBe(byId("write").contentHash);
    await decision(phone, refreshed, "allow", 200); expect(await write.done).toBe("allow");
    for (const card of cards.filter(card => card.id !== "write")) await decision(phone, card, "allow", 200);
  });

  it("refuses truncated text, omitted empty edits and unavailable input, while allowing denial", async () => {
    fixture = await new GatewayFixture().listen(); const phone = await fixture.pair();
    const pending = [
      waiting("Write", { file_path: "a", content: "x".repeat(1999) + "😀" }, "write"),
      waiting("Edit", { file_path: "b", old_string: "a".repeat(1200), new_string: "b".repeat(1200) }, "edit"),
      waiting("MultiEdit", { file_path: "c", edits: Array(17).fill({ old_string: "", new_string: "" }) }, "multi"),
      waiting("Write", { file_path: "d" }, "missing"),
      waiting("Bash", { command: "x".repeat(2001) }, "bash"),
    ];
    const cards = await list(phone);
    expect(cards.find(c => c.id === "write")!.change).toMatchObject({ omitted: 2 });
    expect(cards.find(c => c.id === "multi")!.change).toMatchObject({ omitted: 0, omittedEdits: 1 });
    for (const card of cards) {
      expect(mobilePermissionCanAllow(card)).toBe(false);
      await decision(phone, card, "allow", 400); await decision(phone, card, "deny", 200);
    }
    expect(await Promise.all(pending.map(p => p.done))).toEqual(Array(5).fill("deny"));
  });

  it("fits all 16 worst-escaped bounded entries in one encrypted HTTP response", async () => {
    fixture = await new GatewayFixture().listen(); const phone = await fixture.pair();
    for (let i = 0; i < 16; i++) {
      const p = waiting("MultiEdit", { file_path: "\u0000".repeat(2000), edits: Array(16).fill({ old_string: "\u0000".repeat(1000), new_string: "\u0000".repeat(1000) }) },
        String(i).padEnd(200, "\u0000"), { questId: "\u0000".repeat(200), title: "\u0000".repeat(200) });
      p.card.agent = "\u0000".repeat(200); p.card.name = "\u0000".repeat(200); p.card.summary = "\u0000".repeat(200);
    }
    fixture.gateway.heroes = [{ id: "\u0000".repeat(200), name: "\u0000".repeat(200), town: "\u0000".repeat(200), townId: "\u0000".repeat(200), state: "idle", permissionPending: true, variant: 2 }];
    const cards = await list(phone);
    expect(cards).toHaveLength(16);
    expect(Buffer.byteLength(JSON.stringify(cards))).toBeLessThan(480 * 1024);
    for (const card of cards) {
      expect(mobilePermissionCanAllow(card)).toBe(false);
      expect(card.change).toMatchObject({ kind: "edit", omitted: 31000 });
    }
  });
});
