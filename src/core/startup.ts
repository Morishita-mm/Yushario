export const MINIMUM_NODE_VERSION = "22.12.0";

export function supportedNodeVersion(version: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;
  const major = Number(match[1]), minor = Number(match[2]);
  return major > 22 || (major === 22 && minor >= 12);
}

export type StartupOptions = { port: number; open: boolean };
type StartupResult = { options: StartupOptions } | { help: true } | { error: string; japanese: string };

export function parseStartupOptions(args: string[], environmentPort?: string, open = true): StartupResult {
  if (args.includes("--help") || args.includes("-h")) return { help: true };
  let port = environmentPort ?? "8790";
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--no-open") open = false;
    else if (arg === "--port") {
      if (!args[index + 1] || args[index + 1].startsWith("-")) {
        return { error: "--port needs a value (1-65535).", japanese: "--port に値（1〜65535）を指定してください。" };
      }
      port = args[++index];
    } else if (arg.startsWith("--port=")) port = arg.slice(7);
    else return { error: `Unknown option: ${arg}.`, japanese: `知らないオプションです: ${arg}。` };
  }
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    return { error: "PORT / --port must be an integer from 1 to 65535.", japanese: "PORT / --port は1〜65535の整数で指定してください。" };
  }
  return { options: { port: Number(port), open } };
}
