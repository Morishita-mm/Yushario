import { serverLanguage, tr } from "./language";
import { writeFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node-pty";
import { AGENTS, agentExecutables, executable, type Preset } from "./agents";
import { isClaudeSessionId } from "../core/roster";
import { equipmentArgs, type AgentEquipment, type Equipment } from "../core/equipment";
import { CODEX_HOOKS } from "../core/codex";
import { prependPath, windowsLaunch } from "./windows-command";
import { initialPromptArgs } from "../core/terminal-session";

const root = fileURLToPath(new URL("../../", import.meta.url));
// Keep user configuration, but not server secrets or inherited child-session markers.
const serverOnlyEnvironment = ["AGENT_CHARACTER_TOKEN", "AGENT_CHARACTER_AGENT_TOKEN", "CLAUDE_CODE_CHILD_SESSION", "CLAUDECODE"];
const windows = process.platform === "win32";

// Both shells and Claude's hook runner interpret this command; quote absolute paths safely.
// Codex runs hooks with cmd.exe on Windows, where only double quotes group (paths cannot contain them).
function quote(value: string): string { return windows ? `"${value}"` : `'${value.replaceAll("'", "'\\''")}'`; }

export function writeClaudeSettings(port: number, temporary: string): string {
  const settings = join(temporary, "claude-settings.json");
  const tool = join(root, "scripts/yushario.mjs");
  if (windows) writeFileSync(join(temporary, "yushario.cmd"), `@${quote(process.execPath)} ${quote(tool)} %*\r\n`);
  else writeFileSync(join(temporary, "yushario"), `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(tool)} "$@"\n`, { mode: 0o700 });
  const script = join(root, "adapters/claude-code/hook.mjs");
  // Windows hooks run in Git Bash or PowerShell; exec form starts node without either.
  const hook = windows ? { type: "command", command: process.execPath, args: [script], timeout: 1 }
    : { type: "command", command: `${quote(process.execPath)} ${quote(script)}`, timeout: 1 };
  const hooks = Object.fromEntries([
    "SessionStart", "SessionEnd", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure",
    "Notification", "SubagentStart", "SubagentStop", "TaskCreated", "TaskCompleted", "PreCompact", "PostCompact",
    "Stop", "StopFailure",
  ].map((event) => [event, [{ matcher: "*", hooks: [hook] }]]));
  writeFileSync(settings, JSON.stringify({ hooks: { ...hooks,
    PermissionRequest: [{ matcher: "*", hooks: [{
      type: "http", url: `http://127.0.0.1:${port}/hooks/permission`, timeout: 125,
      headers: { Authorization: "Bearer $AGENT_CHARACTER_AGENT_TOKEN" }, allowedEnvVars: ["AGENT_CHARACTER_AGENT_TOKEN"],
    }] }],
  } }), { mode: 0o600 });
  return settings;
}

export function codexHookArgs(): string[] {
  const source = import.meta.url.endsWith(".ts");
  const runner = source ? `${quote(process.execPath)} --import ${quote(import.meta.resolve("tsx"))}` : quote(process.execPath);
  const command = `${runner} ${quote(join(root, source ? "adapters/codex/hook.ts" : "lib/adapters/codex/hook.js"))}`;
  // Session overrides merge with existing hooks; never edit CODEX_HOME or bypass trust.
  return ["-c", "features.hooks=true", ...CODEX_HOOKS.flatMap((event) => ["-c",
    `hooks.${event}=[{hooks=[{type="command",command=${JSON.stringify(command)},timeout=1}]}]`])];
}

// Force the native approval mode for phone launches. Ordinary per-tool allow rules
// still apply; this does not promise an approval dialog for every tool invocation.
export const MOBILE_LAUNCH_ARGS: Partial<Record<Preset, string[]>> = {
  claude: ["--permission-mode", "default"],
  codex: ["--ask-for-approval", "untrusted", "--sandbox", "workspace-write"],
};

export function launchPty(preset: Preset, cwd: string, id: string, port: number, settings: string,
  equipment: Equipment, master: AgentEquipment, project: string, resume?: string, agentToken?: string, mobile = false, text?: string) {
  const agent = AGENTS[preset];
  const mobileArgs = MOBILE_LAUNCH_ARGS[preset];
  if (mobile && (!mobileArgs || resume !== undefined)) throw new Error(tr("スマホからは この勇者を 起動できない。", "This hero cannot be launched from a phone"));
  if (resume !== undefined && (!agent.resume || !isClaudeSessionId(resume))) throw new Error(tr("よびもどす勇者の ID が正しくない。", "Invalid hero ID for recall"));
  const program = agent.command;
  const path = agentExecutables[preset];
  if (!path || !executable(path)) throw new Error(tr(`${program} が PATH に見つからない。CLI を入れて PATH に追加し、yushario を Ctrl+C で止めて起動し直そう。`, `${program} not found in PATH. Install it, add it to PATH, then stop yushario with Ctrl+C and restart it.`));
  const args = [...agent.args.flatMap((arg) => arg === "$settings" ? [settings] : arg === "$codex-hooks" ? codexHookArgs() : [arg]),
    ...(resume ? [...agent.resumeArgs, resume] : []), ...equipmentArgs(equipment, master, agent, serverLanguage()), ...(mobile ? mobileArgs! : []),
    ...initialPromptArgs(preset, text)];
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  for (const name of serverOnlyEnvironment) delete env[name];
  env.AGENT_CHARACTER_URL = `http://127.0.0.1:${port}/event`;
  env.AGENT_CHARACTER_SESSION = id;
  env.AGENT_CHARACTER_PROJECT = project;
  if (agentToken) env.AGENT_CHARACTER_AGENT_TOKEN = agentToken;
  env.AGENT_CHARACTER_QUEST_TOOL = join(root, "scripts/yushario.mjs");
  env.AGENT_CHARACTER_QUEST_SKILL = join(root, "skills/yushario-party/SKILL.md");
  prependPath(env, dirname(settings), delimiter);
  try {
    const launch = windows ? windowsLaunch(path, args) : { file: path, args };
    return spawn(launch.file, launch.args, { name: "xterm-256color", cols: 80, rows: 24, cwd, env });
  }
  catch { throw new Error(tr(`${agent.label} を起動できない。インストールとフォルダの権限を たしかめよう。`, `Could not launch ${agent.label}. Check installation and folder permissions`)); }
}
