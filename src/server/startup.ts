import { spawn } from "node:child_process";
import type { Server } from "node:http";

export function startupOptions(args: string[]): { port: number; open: boolean } {
  let port = process.env.PORT ?? "8790";
  let open = process.env.NODE_ENV !== "development";
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--no-open") open = false;
    else if (arg === "--port" && args[index + 1]) port = args[++index];
    else if (arg.startsWith("--port=")) port = arg.slice(7);
    else throw new Error(`Unknown option: ${arg}. Use --port <1-65535> or --no-open.`);
  }
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error("PORT / --port must be an integer between 1 and 65535");
  }
  return { port: Number(port), open };
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
  child.on("error", () => console.warn("Could not open a browser; open the printed URL manually."));
  child.on("exit", (code) => { if (code) console.warn("Could not open a browser; open the printed URL manually."); });
  child.unref();
}
