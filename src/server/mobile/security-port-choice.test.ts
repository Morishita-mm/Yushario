import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

const children: ChildProcess[] = [], servers: Server[] = [], directories: string[] = [];
const token = "PUBLIC-PORT-REGRESSION-TOKEN";
async function bind(server: Server, port: number, host = "127.0.0.1"): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const ready = (): void => { server.off("error", error); resolve(); };
    const error = (cause: Error): void => { server.off("listening", ready); reject(cause); };
    server.once("error", error); server.once("listening", ready); server.listen(port, host);
  });
}
async function close(server: Server): Promise<void> { await new Promise<void>(resolve => server.close(() => resolve())); }
async function consecutivePorts(): Promise<{ first: number; holders: Server[] }> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const holders = [createServer(), createServer(), createServer()];
    try {
      await bind(holders[0], 0);
      const first = (holders[0].address() as { port: number }).port;
      if (first > 65533) throw Error("Port range exhausted");
      await bind(holders[1], first + 1); await bind(holders[2], first + 2);
      servers.push(...holders); return { first, holders };
    } catch { await Promise.all(holders.map(close)); }
  }
  throw Error("Could not reserve test ports");
}
function launch(args: string[], dev = false, webPort?: number) {
  const directory = mkdtempSync(join(tmpdir(), "yushario-port-sec-")); directories.push(directory);
  const child = spawn(process.execPath, dev ? ["scripts/dev.mjs", ...args]
    : ["--import", "tsx", "scripts/dev-relay.mjs", ...args], {
    env: { ...process.env, NODE_ENV: "development", AGENT_CHARACTER_TOKEN: token, AGENT_CHARACTER_HOME: directory,
      ...(webPort ? { VITE_PORT: String(webPort) } : {}) }, stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  let text = "";
  child.stdout!.on("data", data => { text = (text + String(data)).slice(-20000); });
  child.stderr!.on("data", data => { text = (text + String(data)).slice(-20000); });
  return { child, output: () => text };
}
async function waitReady(child: ChildProcess, origin: string, output: () => string): Promise<void> {
  for (let attempt = 0; attempt < 250; attempt++) {
    if (child.exitCode !== null || child.signalCode !== null) throw Error(output());
    try {
      const response = await fetch(`${origin}/api/mobile?token=${token}`, { signal: AbortSignal.timeout(100) });
      if (response.status === 200) return;
    } catch { /* The real relay is still starting. */ }
    await setTimeout(20);
  }
  throw Error(`Startup timeout: ${output()}`);
}
async function waitExit(child: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 250; attempt++) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await setTimeout(20);
  }
  throw Error("Child did not exit");
}
afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise<void>(resolve => child.once("exit", () => resolve()));
      child.kill("SIGTERM");
      const force = globalThis.setTimeout(() => child.kill("SIGKILL"), 3000);
      await exited; clearTimeout(force);
    }
  }
  await Promise.all(servers.splice(0).map(close));
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("SEC-11 mobile gateway port reservation", () => {
  it.each(["127.0.0.1", "0.0.0.0"])("skips the reserved mobile port when the main start port is occupied (%s)", async host => {
    const { first, holders } = await consecutivePorts();
    await close(holders[1]); await close(holders[2]); // Keep only our fake existing main server on first.
    const { child, output } = launch(["--port", String(first), "--mobile", `${host}:${first + 1}`, "--no-open"]);
    const origin = `http://127.0.0.1:${first + 2}`;
    await waitReady(child, origin, output);
    const state = await (await fetch(`${origin}/api/mobile?token=${token}`)).json();
    expect(state.enabled).toBe(true);
    expect(state.addresses.every((address: string) => address.endsWith(`:${first + 1}`))).toBe(true);
    expect((await fetch(`http://127.0.0.1:${first + 1}/api/mobile`)).status).toBe(400);
    expect(output()).not.toContain("EADDRINUSE");
  }, 15000);

  it("keeps the next free IPv4 main port when an IPv6-loopback gateway does not conflict", async context => {
    const probe = createServer(); servers.push(probe);
    try { await bind(probe, 0, "::1"); await close(probe); }
    catch { context.skip(); return; } // Some test hosts deliberately disable IPv6.
    const { first, holders } = await consecutivePorts();
    await close(holders[1]); await close(holders[2]);
    const { child, output } = launch(["--port", String(first), "--mobile", `[::1]:${first + 1}`, "--no-open"]);
    const origin = `http://127.0.0.1:${first + 1}`;
    await waitReady(child, origin, output);
    const state = await (await fetch(`${origin}/api/mobile?token=${token}`)).json();
    expect(state.addresses).toEqual([`http://[::1]:${first + 1}`]);
  }, 15000);

  it("reports an occupied gateway port bilingually without a stack and exits dev without either listener", async () => {
    const { first, holders } = await consecutivePorts();
    await close(holders[1]); await close(holders[2]); // Only the requested gateway port is genuinely occupied.
    const { child, output } = launch(["--port", String(first + 1), "--mobile", `127.0.0.1:${first}`, "--no-open"], true, first + 2);
    await waitExit(child);
    expect(child.exitCode).toBe(1);
    expect(output()).toContain(`Mobile gateway 127.0.0.1:${first} is already in use`);
    expect(output()).toContain("スマホ窓口"); expect(output()).toContain("ポートを変えてください");
    expect(output()).not.toContain("node:net"); expect(output()).not.toContain("triggerUncaughtException");
    for (const port of [first + 1, first + 2]) {
      await expect(fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(500) })).rejects.toThrow();
    }
  }, 15000);
});
