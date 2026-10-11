import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node-pty";
import { AGENTS, agentExecutables, type Preset } from "./agents";
import { isClaudeSessionId } from "../core/roster";
import { equipmentArgs, type AgentEquipment, type Equipment } from "../core/equipment";

const root = fileURLToPath(new URL("../../", import.meta.url));
// Keep user configuration, but not server secrets or inherited child-session markers.
const serverOnlyEnvironment = ["AGENT_CHARACTER_TOKEN", "CLAUDE_CODE_CHILD_SESSION", "CLAUDECODE"];

// Both shells and Claude's hook runner interpret this command; quote absolute paths safely.
function quote(value: string): string { return `'${value.replaceAll("'", "'\\''")}'`; }

export function writeClaudeSettings(port: number, temporary: string): string {
  const settings = join(temporary, "claude-settings.json");
  const command = `${quote(process.execPath)} ${quote(join(root, "adapters/claude-code/hook.mjs"))}`;
  const hooks = Object.fromEntries([
    "SessionStart", "SessionEnd", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure",
    "Notification", "SubagentStart", "SubagentStop", "TaskCreated", "TaskCompleted", "PreCompact", "PostCompact",
    "Stop", "StopFailure",
  ].map((event) => [event, [{ matcher: "*", hooks: [{ type: "command", command, timeout: 1 }] }]]));
  writeFileSync(settings, JSON.stringify({ hooks: { ...hooks,
    PermissionRequest: [{ matcher: "*", hooks: [{
      type: "http", url: `http://127.0.0.1:${port}/hooks/permission`, timeout: 125,
    }] }],
  } }), { mode: 0o600 });
  return settings;
}

export function launchPty(preset: Preset, cwd: string, id: string, port: number, settings: string,
  equipment: Equipment, master: AgentEquipment, project: string, resume?: string) {
  const agent = AGENTS[preset];
  if (resume !== undefined && (!agent.resume || !isClaudeSessionId(resume))) throw new Error("再開する勇者の ID が正しくありません");
  const program = agent.command;
  const path = agentExecutables[preset];
  if (!path) throw new Error(`${program} not found in PATH. Install it, then stop and restart agent-quest. / ${program} が PATH に見つかりません。① CLI を入れて PATH に追加 → ② agent-quest を止める（Ctrl+C）→ ③ 起動し直してください。`);
  const args = [...agent.args.map((arg) => arg === "$settings" ? settings : arg),
    ...(resume ? [...agent.resumeArgs, resume] : []), ...equipmentArgs(equipment, master, agent)];
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  for (const name of serverOnlyEnvironment) delete env[name];
  env.AGENT_CHARACTER_URL = `http://127.0.0.1:${port}/event`;
  env.AGENT_CHARACTER_SESSION = id;
  env.AGENT_CHARACTER_PROJECT = project;
  try { return spawn(path, args, { name: "xterm-256color", cols: 80, rows: 24, cwd, env }); }
  catch { throw new Error(`${agent.label} を起動できませんでした。インストールとフォルダの権限を確認してください`); }
}
