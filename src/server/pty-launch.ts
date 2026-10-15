import { serverLanguage, tr } from "./language";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node-pty";
import { AGENTS, agentExecutables, type Preset } from "./agents";
import { isClaudeSessionId } from "../core/roster";
import { equipmentArgs, type AgentEquipment, type Equipment } from "../core/equipment";
import { CODEX_HOOKS } from "../core/codex";

const root = fileURLToPath(new URL("../../", import.meta.url));
// Keep user configuration, but not server secrets or inherited child-session markers.
const serverOnlyEnvironment = ["AGENT_CHARACTER_TOKEN", "AGENT_CHARACTER_AGENT_TOKEN", "CLAUDE_CODE_CHILD_SESSION", "CLAUDECODE"];

// Both shells and Claude's hook runner interpret this command; quote absolute paths safely.
function quote(value: string): string { return `'${value.replaceAll("'", "'\\''")}'`; }

export function writeClaudeSettings(port: number, temporary: string): string {
  const settings = join(temporary, "claude-settings.json");
  writeFileSync(join(temporary, "yushario"), `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(join(root, "scripts/yushario.mjs"))} "$@"\n`, { mode: 0o700 });
  const command = `${quote(process.execPath)} ${quote(join(root, "adapters/claude-code/hook.mjs"))}`;
  const hooks = Object.fromEntries([
    "SessionStart", "SessionEnd", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure",
    "Notification", "SubagentStart", "SubagentStop", "TaskCreated", "TaskCompleted", "PreCompact", "PostCompact",
    "Stop", "StopFailure",
  ].map((event) => [event, [{ matcher: "*", hooks: [{ type: "command", command, timeout: 1 }] }]]));
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

export function launchPty(preset: Preset, cwd: string, id: string, port: number, settings: string,
  equipment: Equipment, master: AgentEquipment, project: string, resume?: string, agentToken?: string) {
  const agent = AGENTS[preset];
  if (resume !== undefined && (!agent.resume || !isClaudeSessionId(resume))) throw new Error(tr("再開する勇者の ID が正しくありません", "Invalid hero ID for recall"));
  const program = agent.command;
  const path = agentExecutables[preset];
  if (!path) throw new Error(tr(`${program} が PATH に見つかりません。① CLI を入れて PATH に追加 → ② yushario を止める（Ctrl+C）→ ③ 起動し直してください。`, `${program} not found in PATH. Install it, then stop and restart yushario.`));
  const args = [...agent.args.flatMap((arg) => arg === "$settings" ? [settings] : arg === "$codex-hooks" ? codexHookArgs() : [arg]),
    ...(resume ? [...agent.resumeArgs, resume] : []), ...equipmentArgs(equipment, master, agent, serverLanguage())];
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  for (const name of serverOnlyEnvironment) delete env[name];
  env.AGENT_CHARACTER_URL = `http://127.0.0.1:${port}/event`;
  env.AGENT_CHARACTER_SESSION = id;
  env.AGENT_CHARACTER_PROJECT = project;
  if (agentToken) env.AGENT_CHARACTER_AGENT_TOKEN = agentToken;
  env.AGENT_CHARACTER_QUEST_TOOL = join(root, "scripts/yushario.mjs");
  env.AGENT_CHARACTER_QUEST_SKILL = join(root, "skills/yushario-party/SKILL.md");
  env.PATH = `${dirname(settings)}:${env.PATH ?? ""}`;
  try { return spawn(path, args, { name: "xterm-256color", cols: 80, rows: 24, cwd, env }); }
  catch { throw new Error(tr(`${agent.label} を起動できませんでした。インストールとフォルダの権限を確認してください`, `Could not launch ${agent.label}. Check installation and folder permissions`)); }
}
