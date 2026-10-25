// Full relay child process + real test CLIs for mobile work SEC tests. No PTY, HTTP, crypto or SQLite mocks.
// The test CLIs are real executables named claude/codex/pi placed first on the child PATH; they never call an LLM.
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { expect } from "vitest";
import { decodeOffer, TestPhone } from "./test-client";

export const requestId = (at = Date.now()) => `${at}.${randomBytes(16).toString("base64url")}`;
export const REJECTED = '{"error":"rejected"}';

// Records argv/cwd and pasted requests (never tokens or keys); sends the same authenticated hooks as the adapters.
const FAKE_CLI = `
const { appendFileSync, readFileSync, renameSync, writeFileSync } = require("node:fs");
const { basename, join } = require("node:path");
const { randomUUID } = require("node:crypto");
const name = basename(process.argv[1]), log = process.env.YUSHARIO_FAKE_LOG, agent = randomUUID();
const source = { claude: "claude-code", codex: "codex", pi: "pi" }[name];
const file = join(log, name + "-" + process.pid);
// Write then rename so a polling test never reads a half-written record.
writeFileSync(file + ".tmp", JSON.stringify({ name, pid: process.pid, argv: process.argv.slice(2), cwd: process.cwd(), terminal: process.env.AGENT_CHARACTER_SESSION,
  agentToken: Boolean(process.env.AGENT_CHARACTER_AGENT_TOKEN), serverToken: Boolean(process.env.AGENT_CHARACTER_TOKEN) }));
renameSync(file + ".tmp", file + ".json");
function hook(hook, state, extra = {}) {
  const event = { state, hook, source, agent, ts: Date.now(), terminal: process.env.AGENT_CHARACTER_SESSION,
    project: process.env.AGENT_CHARACTER_PROJECT, name: basename(process.cwd()), ...extra };
  return fetch(process.env.AGENT_CHARACTER_URL, { method: "POST", body: JSON.stringify(event), headers: { "Content-Type": "application/json",
    Authorization: "Bearer " + process.env.AGENT_CHARACTER_AGENT_TOKEN } }).catch(() => undefined);
}
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdout.write("test cli ready\\r\\n");
let buffer = "";
process.stdin.on("data", async chunk => {
  buffer += chunk.toString("utf8");
  for (;;) {
    const enter = buffer.indexOf("\\r");
    if (enter < 0) return;
    let line = buffer.slice(0, enter); buffer = buffer.slice(enter + 1);
    const paste = /\\x1b\\[200~([\\s\\S]*)\\x1b\\[201~/.exec(line);
    const text = paste ? paste[1] : line.replace(/[\\x00-\\x1f]/g, "");
    appendFileSync(file + ".input.jsonl", JSON.stringify({ paste: Boolean(paste), text }) + "\\n");
    if (!paste && /^\\/(exit|quit)$/.test(text)) { await hook("SessionEnd", "idle"); process.exit(0); }
    await hook("UserPromptSubmit", "thinking", { text });
    if (!text.includes("TEST-HOLD")) await hook("Stop", "success", { text: "test cli finished" });
  }
});
hook("SessionStart", "idle");
// A real ready hook after an interrupt, sent when the test decides.
process.on("SIGUSR1", () => hook("Stop", "success", { text: "test cli stopped" }));
// A4 test-only permission hook; input/result contain synthetic data, never credentials.
process.on("SIGUSR2", async () => {
  const input = JSON.parse(readFileSync(file + ".permission-input", "utf8"));
  const response = await fetch(new URL("/hooks/permission", process.env.AGENT_CHARACTER_URL), {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.AGENT_CHARACTER_AGENT_TOKEN },
    body: JSON.stringify({ hook_event_name: "PermissionRequest", session_id: agent, ...input }),
  });
  writeFileSync(file + ".permission-result", await response.text());
});
setInterval(() => undefined, 60_000);
`;

export type FakeLaunch = { name: string; pid: number; argv: string[]; cwd: string; terminal: string; agentToken: boolean; serverToken: boolean };
export const PRIVATE_BRANCH = "sec-private-branch";
export type Relay = {
  child: ChildProcess; root: string; home: string; log: string; main: string; mobile: string; token: string;
  towns: { git: string; plain: string; other: string }; output: () => string;
};

async function freePorts(count: number): Promise<number[]> {
  const holders = Array.from({ length: count }, () => createServer());
  const ports: number[] = [];
  for (const server of holders) {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    ports.push((server.address() as { port: number }).port);
  }
  await Promise.all(holders.map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  return ports;
}
function gitTown(path: string, env: NodeJS.ProcessEnv): void {
  mkdirSync(path, { recursive: true });
  execFileSync("git", ["init", "-q", "-b", PRIVATE_BRANCH], { cwd: path, env });
  writeFileSync(join(path, "README.md"), "test town\n");
  execFileSync("git", ["add", "."], { cwd: path, env });
  execFileSync("git", ["-c", "user.name=SEC", "-c", "user.email=sec@example.invalid", "commit", "-q", "-m", "init"], { cwd: path, env });
}

const running = new Set<Relay>();
export async function startRelay(seed?: Relay): Promise<Relay> {
  const root = seed?.root ?? realpathSync(mkdtempSync(join(tmpdir(), "yushario-work-sec-")));
  const home = join(root, "data"), bin = join(root, "bin"), log = join(root, "log"), user = join(root, "user");
  const towns = { git: join(root, "towns", "git-town"), plain: join(root, "towns", "plain-town"), other: join(root, "towns", "other-town") };
  // Hermetic git and HOME: never read the user's configuration, keys or agent settings.
  const gitConfig = join(root, "gitconfig");
  const env = { ...process.env, HOME: user, GIT_CONFIG_GLOBAL: gitConfig, GIT_CONFIG_NOSYSTEM: "1" };
  if (!seed) {
    for (const directory of [home, bin, log, user]) mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(gitConfig, "");
    gitTown(towns.git, env); gitTown(towns.other, env); mkdirSync(towns.plain, { recursive: true });
    for (const name of ["claude", "codex", "pi"]) writeFileSync(join(bin, name), `#!${process.execPath}\n${FAKE_CLI}`, { mode: 0o700 });
    writeFileSync(join(home, "towns.json"), JSON.stringify(Object.entries(towns).map(([name, path]) =>
      ({ path, name, firstSeenAt: 1, lastActiveAt: Date.now(), pinned: true }))), { mode: 0o600 });
  }
  const [mainPort, mobilePort] = await freePorts(2);
  const token = "PUBLIC-WORK-SEC-TOKEN";
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/relay.ts", "--port", String(mainPort), "--no-open", "--mobile", `127.0.0.1:${mobilePort}`], {
    env: { ...env, PATH: `${bin}:${process.env.PATH ?? ""}`, NODE_ENV: "development", AGENT_CHARACTER_HOME: home,
      AGENT_CHARACTER_TOKEN: token, YUSHARIO_FAKE_LOG: log }, stdio: ["ignore", "pipe", "pipe"], detached: true,
  });
  let text = "";
  child.stdout!.on("data", bytes => { text = (text + String(bytes)).slice(-20000); });
  child.stderr!.on("data", bytes => { text = (text + String(bytes)).slice(-20000); });
  const relay: Relay = { child, root, home, log, main: `http://127.0.0.1:${mainPort}`, mobile: `http://127.0.0.1:${mobilePort}`, token, towns, output: () => text };
  running.add(relay);
  for (let attempt = 0; attempt < 300; attempt++) {
    if (child.exitCode !== null) throw Error(text);
    try { if ((await fetch(`${relay.main}/api/mobile?token=${token}`, { signal: AbortSignal.timeout(200) })).status === 200) return relay; }
    catch { /* Wait for the real listeners. */ }
    await setTimeout(20);
  }
  throw Error(`Relay startup timeout: ${text}`);
}
// Stops the relay and every test CLI it started (own process group), keeping files when `keep` is set for a restart.
export async function stopRelay(relay: Relay, keep = false): Promise<void> {
  if (relay.child.exitCode === null && relay.child.signalCode === null) {
    const ended = new Promise<void>(resolve => relay.child.once("exit", () => resolve()));
    relay.child.kill("SIGTERM");
    const forced = globalThis.setTimeout(() => { try { process.kill(-relay.child.pid!, "SIGKILL"); } catch { /* Gone. */ } }, 3000);
    await ended; clearTimeout(forced);
  }
  for (const launch of launches(relay)) { try { process.kill(launch.pid, "SIGKILL"); } catch { /* Already exited. */ } }
  running.delete(relay);
  if (!keep) rmSync(relay.root, { recursive: true, force: true });
}
export async function stopAll(): Promise<void> { for (const relay of [...running]) await stopRelay(relay); }

export async function screen(relay: Relay, path: string, method = "GET", body?: object) {
  const response = await fetch(`${relay.main}/api${path}${path.includes("?") ? "&" : "?"}token=${relay.token}`, { method,
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  return { status: response.status, json: await response.json().catch(() => undefined) };
}
export async function pairPhone(relay: Relay, name = "Work phone", allowWork = true): Promise<TestPhone> {
  const offer = decodeOffer((await screen(relay, "/mobile/pair", "POST", { addresses: [relay.mobile] })).json.pairing.pairingString);
  const phone = new TestPhone(offer);
  const pending = post(relay, phone.packet("pair", { pairingCode: offer.pairingCode, name, pushToken: null }));
  await until(async () => (await screen(relay, "/mobile")).json.pairing?.status === "pending");
  if ((await screen(relay, "/mobile/confirm", "POST", { deviceId: phone.id, approve: true })).status !== 200) throw Error("confirm failed");
  if ((await pending).status !== 200) throw Error("pair failed");
  if (allowWork) await setWork(relay, phone, true);
  return phone;
}
export async function setWork(relay: Relay, phone: TestPhone, enabled: boolean): Promise<void> {
  if ((await screen(relay, `/mobile/devices/${phone.id}/work`, "POST", { enabled })).status !== 200) throw Error("opt-in failed");
}
export async function post(relay: Relay, packet: unknown) {
  const response = await fetch(relay.mobile + "/mobile/v1", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(packet), signal: AbortSignal.timeout(10_000) });
  return { status: response.status, text: await response.text() };
}
// Signed, encrypted request; returns the verified response body or the raw rejection text.
export async function call(relay: Relay, phone: TestPhone, operation: string, body: object) {
  const response = await post(relay, phone.packet(operation, body));
  if (response.status !== 200) return { status: response.status, text: response.text, body: undefined };
  const opened = phone.open(JSON.parse(response.text));
  if (opened.operation !== operation) throw Error(`wrong response ${opened.operation}`);
  return { status: 200, text: response.text, body: opened.body as unknown as Record<string, any> };
}
export async function ok(relay: Relay, phone: TestPhone, operation: string, body: object): Promise<Record<string, any>> {
  const result = await call(relay, phone, operation, body);
  if (result.status !== 200) throw Error(`${operation} rejected: ${result.text}\n${relay.output().slice(-2000)}`);
  return result.body!;
}
export async function townIds(relay: Relay, phone: TestPhone): Promise<Record<"git" | "plain" | "other", string>> {
  const towns = (await ok(relay, phone, "towns", { cursor: null })).towns as { id: string; name: string }[];
  const id = (name: string) => towns.find(town => town.name === name)?.id ?? "";
  return { git: id("git-town"), plain: id("plain-town"), other: id("other-town") };
}
export async function launchOnMac(relay: Relay, preset: "claude" | "codex" | "pi", cwd: string): Promise<FakeLaunch> {
  const before = new Set(launches(relay).map(launch => launch.pid));
  const created = await screen(relay, "/sessions", "POST", { preset, cwd });
  if (created.status !== 201) throw Error(`Mac launch failed: ${JSON.stringify(created.json)}`);
  let launch: FakeLaunch | undefined;
  await until(async () => Boolean(launch = launches(relay).find(item => !before.has(item.pid) && item.name === preset)));
  await ready(relay, launch!);
  return launch!;
}
// Waits on the Mac API (not the phone gateway, whose per-IP budget is 30 requests a minute) until the CLI's SessionStart arrived.
export async function ready(relay: Relay, launch: FakeLaunch): Promise<void> {
  await until(async () => Boolean(((await screen(relay, "/sessions")).json as { id: string; hero?: string }[]).find(item => item.id === launch.terminal)?.hero));
}
export async function spawned(relay: Relay, name: "claude" | "codex", count: number): Promise<FakeLaunch> {
  await until(() => launches(relay).filter(item => item.name === name).length >= count);
  const launch = launches(relay).filter(item => item.name === name)[count - 1];
  await ready(relay, launch); return launch;
}
export async function restartRelay(relay: Relay): Promise<Relay> { await stopRelay(relay, true); return startRelay(relay); }
export const mobileFile = (relay: Relay, name: string) => join(relay.home, "mobile", name);
// Test-only: move this fixture's reservation times into the past (request IDs and issuedAt stay valid)
// so durable hourly/live limits can be reached without sleeping or mocking the child's clock.
export function ageReservations(relay: Relay, ms: number): void {
  const file = mobileFile(relay, "quest-requests.json");
  const records = JSON.parse(readFileSync(file, "utf8")) as { time: number }[];
  writeFileSync(file, JSON.stringify(records.map(record => ({ ...record, time: record.time - ms }))), { mode: 0o600 });
}
export async function interrupt(relay: Relay, launch: FakeLaunch): Promise<void> {
  if ((await screen(relay, `/sessions/${launch.terminal}/action`, "POST", { action: "interrupt" })).status !== 200) throw Error("interrupt failed");
}
export const readyAgain = (launch: FakeLaunch) => process.kill(launch.pid, "SIGUSR1");
export async function questCount(relay: Relay): Promise<number> { return (await screen(relay, "/quests")).json.length; }
// Responses must not reveal local paths, branches, launch arguments or credentials.
export function privateText(relay: Relay, text: string): string[] {
  return [relay.root, PRIVATE_BRANCH, "/private/", "/var/folders", ".git", "--settings", "AGENT_CHARACTER", relay.token].filter(value => text.includes(value));
}
export function launches(relay: Relay): FakeLaunch[] {
  if (!existsSync(relay.log)) return [];
  return readdirSync(relay.log).filter(file => file.endsWith(".json"))
    .map(file => JSON.parse(readFileSync(join(relay.log, file), "utf8")) as FakeLaunch).sort((a, b) => a.pid - b.pid);
}
export function received(relay: Relay, launch: FakeLaunch): { paste: boolean; text: string }[] {
  const file = join(relay.log, `${launch.name}-${launch.pid}.input.jsonl`);
  // A line still being appended is skipped until it is complete.
  return existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(line => line.endsWith("}")).map(line => JSON.parse(line)) : [];
}
export async function until(check: () => boolean | Promise<boolean>, ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() <= end) { if (await check()) return; await setTimeout(25); }
  throw Error("Condition did not settle");
}
// Lets in-flight hooks/deliveries settle before asserting that something did NOT happen.
export const settle = (ms = 600) => setTimeout(ms);

// Shared phone-side request helpers. Each fixture stays well under the gateway's 30 requests/minute/IP bucket,
// so every rejection below is decided by the work parser/rules, not by the transport throttle.
export type Options = { allowWork: boolean; heroes: Record<string, any>[]; bases: { id: string; name: string }[];
  presets: { id: string; name: string; weapons: { id: string }[]; accessories: { id: string }[] }[] };
export const options = (relay: Relay, phone: TestPhone, townId: string) => ok(relay, phone, "quest-options", { townId }) as Promise<Options>;
export const launchBody = (value: Options, pattern: RegExp) => ({ baseId: value.bases[0].id,
  presetId: value.presets.find(item => pattern.test(item.name))!.id, weaponId: null, accessoryId: null });
export const prepare = (townId: string, patch: object = {}) => ({ requestId: requestId(), townId, text: "調べて", mode: "only", heroId: null, launch: null, ...patch });
export const form = (questId: string, members: object[], tactic = "obey", text = "TEST 本題") => ({ requestId: requestId(), questId, text, tactic, members });
export const member = (heroId: string, role: string, writer = false, ask = "") => ({ heroId, role, writer, ask });
export async function rejected(relay: Relay, phone: TestPhone, operation: string, body: object): Promise<void> {
  const result = await call(relay, phone, operation, body);
  expect(result.status, `${operation} ${JSON.stringify(body).slice(0, 200)}`).toBe(400); expect(result.text).toBe(REJECTED);
}
export function noPrivate(relay: Relay, value: unknown): void { expect(privateText(relay, JSON.stringify(value))).toEqual([]); }
// Hero IDs are opaque; learn each Mac-started process's hero by launching them one at a time.
export async function macHeroes(relay: Relay, phone: TestPhone, townId: string, presets: ("pi" | "claude" | "codex")[], cwd = relay.towns.git) {
  const known: string[] = [], result: { launch: FakeLaunch; heroId: string }[] = [];
  for (const preset of presets) {
    const launch = await launchOnMac(relay, preset, cwd);
    const heroId = (await options(relay, phone, townId)).heroes.map(hero => hero.id as string).find(id => !known.includes(id))!;
    known.push(heroId); result.push({ launch, heroId });
  }
  return result;
}
