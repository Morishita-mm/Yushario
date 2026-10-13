import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync, rmSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseStartupOptions, type StartupOptions } from "../core/startup";

export const dataDirectory = resolve(process.env.AGENT_CHARACTER_HOME || join(homedir(), ".config", "agent-character"));

export function prepareDataDirectory(): void {
  mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
  const probe = join(dataDirectory, `.write-check-${randomUUID()}`);
  const descriptor = openSync(probe, "wx", 0o600);
  try {
    try { writeFileSync(descriptor, ""); }
    finally { closeSync(descriptor); }
  } finally { rmSync(probe, { force: true }); }
}

export function startupOptions(args: string[]): StartupOptions {
  const result = parseStartupOptions(args, process.env.PORT, process.env.NODE_ENV !== "development");
  if ("options" in result) return result.options;
  throw new Error("error" in result ? `${result.error} Use --help. / ${result.japanese} --help を見てください。` : "Use yushario --help.");
}

// Bind the real server rather than probe-and-close: no gap for another process to take the port.
export async function listenAvailable(server: Server, start: number): Promise<number> {
  for (let port = start; port <= 65535; port++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const error = (error: Error): void => { server.off("listening", ready); reject(error); };
        const ready = (): void => { server.off("error", error); resolve(); };
        server.once("error", error); server.once("listening", ready);
        server.listen(port, "127.0.0.1");
      });
      return port;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
    }
  }
  throw new Error(`No free port at or above ${start}`);
}

export function openBrowser(url: string): void {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "rundll32" : "xdg-open";
  const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  const guidance = "Could not open a browser; open the printed URL manually. / ブラウザを開けませんでした。表示した URL を手動で開いてください。";
  child.on("error", () => console.warn(guidance));
  child.on("exit", (code) => { if (code) console.warn(guidance); });
  child.unref();
}
