import { execFile, execFileSync } from "node:child_process";

const NULL = process.platform === "win32" ? "NUL" : "/dev/null";
const LIMIT = 1024 * 1024;
// Do not inherit Git configuration injection, alternate repositories or executables.
export function gitEnvironment(): NodeJS.ProcessEnv {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  return { ...env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: NULL, GIT_OPTIONAL_LOCKS: "0", GIT_LITERAL_PATHSPECS: "1", GIT_TERMINAL_PROMPT: "0" };
}
export const safeGitArgs = (args: string[]): string[] => [
  "-c", "core.fsmonitor=false", "-c", `core.hooksPath=${NULL}`, "-c", "submodule.recurse=false", "-c", "core.quotepath=false", "-c", "color.ui=false", ...args,
];

function run(cwd: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => execFile("git", safeGitArgs(args),
    { cwd, env: gitEnvironment(), timeout: 5000, maxBuffer: LIMIT, encoding: "buffer" },
    (error, stdout) => error ? reject(error) : resolve(stdout)));
}
export async function gitText(cwd: string, args: string[]): Promise<string> {
  return (await gitBuffer(cwd, args)).toString("utf8");
}
export function gitTextSync(cwd: string, args: string[]): string {
  return execFileSync("git", safeGitArgs(args), { cwd, env: gitEnvironment(), timeout: 1000, maxBuffer: 64 * 1024,
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

// Checkout and diff/status can invoke named clean/smudge/process filters. Inspect
// names only (git config does not run them), then disable each configured driver.
// This is not isolation from a same-UID process racing writes to .git/config.
export async function gitBuffer(cwd: string, args: string[]): Promise<Buffer> {
  let names: string;
  try { names = (await run(cwd, ["config", "--null", "--name-only", "--get-regexp", "^filter\\..*\\.(clean|smudge|process|required)$"])).toString("utf8"); }
  catch (error) { if ((error as { code?: unknown }).code !== 1) throw error; names = ""; }
  const keys = [...new Set(names.split("\0").filter(Boolean))];
  // -c separates at '='; refuse names that cannot be safely overridden.
  if (keys.some((key) => /[=\x00-\x20\x7f]/.test(key))) throw new Error("Unsupported Git filter name");
  const overrides = keys.flatMap((name) => ["-c", `${name}=${name.endsWith(".required") ? "false" : ""}`]);
  return run(cwd, [...overrides, ...args]);
}
