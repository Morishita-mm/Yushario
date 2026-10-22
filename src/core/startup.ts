export const MINIMUM_NODE_VERSION = "22.13.0";

export function supportedNodeVersion(version: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;
  const major = Number(match[1]), minor = Number(match[2]);
  return major > 22 || (major === 22 && minor >= 13);
}

export type MobileBind = { host: string; port: number };
export type StartupOptions = { port: number; open: boolean; mobile?: MobileBind };

export function parseMobileBind(value: string): MobileBind | undefined {
  const match = /^(\[[0-9a-fA-F:.]+\]|[A-Za-z0-9][A-Za-z0-9.-]*):([1-9][0-9]{0,4})$/.exec(value);
  if (!match || Number(match[2]) > 65535) return;
  return { host: match[1].startsWith("[") ? match[1].slice(1, -1) : match[1], port: Number(match[2]) };
}
type StartupResult = { options: StartupOptions } | { help: true } | { error: string; japanese: string };

export function parseStartupOptions(args: string[], environmentPort?: string, open = true): StartupResult {
  if (args.includes("--help") || args.includes("-h")) return { help: true };
  let port = environmentPort ?? "8790", mobile: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--no-open") open = false;
    else if (arg === "--port") {
      if (!args[index + 1] || args[index + 1].startsWith("-")) {
        return { error: "--port needs a value (1-65535).", japanese: "--port に値（1〜65535）を指定してください。" };
      }
      port = args[++index];
    } else if (arg.startsWith("--port=")) port = arg.slice(7);
    else if (arg === "--mobile") {
      if (!args[index + 1] || args[index + 1].startsWith("-")) {
        return { error: "--mobile needs host:port.", japanese: "--mobile に host:port を指定してください。" };
      }
      mobile = args[++index];
    } else if (arg.startsWith("--mobile=")) mobile = arg.slice(9);
    else return { error: `Unknown option: ${arg}.`, japanese: `知らないオプションです: ${arg}。` };
  }
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    return { error: "PORT / --port must be an integer from 1 to 65535.", japanese: "PORT / --port は1〜65535の整数で指定してください。" };
  }
  if (mobile !== undefined && !parseMobileBind(mobile)) {
    return { error: "--mobile must be host:port (IPv6: [address]:port), port 1-65535.", japanese: "--mobile は host:port（IPv6 は [address]:port）、ポート1〜65535で指定してください。" };
  }
  return { options: { port: Number(port), open, ...(mobile !== undefined ? { mobile: parseMobileBind(mobile)! } : {}) } };
}
