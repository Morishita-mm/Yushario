import { readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";

// node-pty cannot start .cmd/.bat files, and cmd.exe would re-parse quotes in Codex's -c arguments.
// npm's .cmd shim ends with `"%dp0%\<target>" %*`; run that target directly instead.
export function windowsLaunch(path: string, args: string[]): { file: string; args: string[] } {
  if (![".cmd", ".bat"].includes(extname(path).toLowerCase())) return { file: path, args };
  const match = /"%dp0%\\([^"]+)"\s*%\*/i.exec(readFileSync(path, "utf8"));
  if (!match) throw new Error(`Unsupported command shim: ${path}`);
  const target = join(dirname(path), match[1]);
  return extname(target).toLowerCase() === ".exe" ? { file: target, args } : { file: process.execPath, args: [target, ...args] };
}

// Windows names the variable Path; a copied env object is case-sensitive, so reuse the existing key.
export function prependPath(env: Record<string, string>, directory: string, delimiter: string): void {
  const key = Object.keys(env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
  env[key] = env[key] ? `${directory}${delimiter}${env[key]}` : directory;
}
