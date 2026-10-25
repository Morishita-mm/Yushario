import { accessSync, constants, statSync } from "node:fs";
import { delimiter, extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const windows = process.platform === "win32";

// The only agent catalogue: CLI arguments, town capabilities, and PTY controls.
// $settings is replaced with this server's temporary Claude hook configuration.
export const AGENTS = {
  claude: {
    label: "Claude Code", command: "claude", args: ["--settings", "$settings"], source: "claude-code",
    hero: true, resume: true, resumeArgs: ["--resume"], compact: true, compactCommand: "/compact",
    interrupt: "\x1b", clearDraft: "\x03", restoresDraft: true, farewell: "/exit",
    modelArg: "--model", thinkingArg: "--effort", modelCommand: "", thinkingCommand: "", // /model and /effort save user defaults.
  },
  codex: {
    label: "Codex", command: "codex", args: ["--no-daemon", "$codex-hooks"], source: "codex",
    hero: true, resume: true, resumeArgs: ["resume"], compact: true, compactCommand: "/compact",
    interrupt: "\x1b", clearDraft: "\x15", restoresDraft: false, farewell: "/quit", // Ctrl+C on an empty prompt quits Codex. /hooks trust review stays in Codex.
    modelArg: "-m", thinkingArg: "", modelCommand: "", thinkingCommand: "",
  },
  pi: {
    label: "pi", command: "pi", args: ["-e", join(root, import.meta.url.endsWith(".ts") ? "adapters/pi/agent-character.ts" : "lib/adapters/pi/agent-character.js")], source: "pi",
    hero: true, resume: true, resumeArgs: ["--session"], compact: true, compactCommand: "/compact",
    interrupt: "\x1b", clearDraft: "\x03", restoresDraft: false, farewell: "/quit",
    modelArg: "--model", thinkingArg: "--thinking", modelCommand: "/model", thinkingCommand: "/thinking",
  },
  shell: {
    label: "shell", command: windows ? process.env.COMSPEC || "cmd.exe" : process.env.SHELL || "/bin/sh", args: [], source: "shell",
    hero: false, resume: false, resumeArgs: [], compact: false, compactCommand: "",
    interrupt: "\x03", clearDraft: "\x03", restoresDraft: false, farewell: "exit",
    modelArg: "", thinkingArg: "", modelCommand: "", thinkingCommand: "",
  },
};
export type Preset = keyof typeof AGENTS;
export const PRESETS = Object.keys(AGENTS) as Preset[];
// Windows needs a PATHEXT extension: npm also installs an extensionless sh script there.
const extensions = windows ? (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean) : [""];
export function executable(command: string): string | undefined {
  const names = windows && extname(command) ? [command] : extensions.map((extension) => command + extension);
  const paths = command.includes("/") || isAbsolute(command) ? names.map((name) => resolve(name))
    // Relative PATH entries would depend on the launch folder; skip them.
    : (process.env.PATH ?? "").split(delimiter).filter(isAbsolute).flatMap((directory) => names.map((name) => join(directory, name)));
  return paths.find((path) => {
    try { accessSync(path, constants.X_OK); return statSync(path).isFile(); } catch { return false; }
  });
}

// Detect once at startup; shell is always offered, even with no agent CLI installed.
export const agentExecutables = Object.fromEntries(PRESETS.map((id) => [id, executable(AGENTS[id].command)])) as Record<Preset, string | undefined>;
const available = PRESETS.filter((id) => id === "shell" || agentExecutables[id]);
export const publicAgents = () => available.map((id) => {
  const { label, hero, resume, compact, modelCommand, thinkingCommand } = AGENTS[id];
  return { id, label, hero, resume, compact, equipWeapon: Boolean(modelCommand), equipAccessory: Boolean(thinkingCommand) };
});
