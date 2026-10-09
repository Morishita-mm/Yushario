import { accessSync, constants, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node-pty";
import { WebSocket, WebSocketServer } from "ws";

const root = fileURLToPath(new URL("../../", import.meta.url));
const presets = ["shell", "claude", "pi", "codex"] as const;
// Claude Code 2.1.295 uses these two markers to detect an inherited child session.
// Keep user configuration (e.g. CLAUDE_CODE_USE_BEDROCK) intact.
const serverOnlyEnvironment = ["TYPESAFE_API_KEY", "AGENT_CHARACTER_TOKEN", "CLAUDE_CODE_CHILD_SESSION", "CLAUDECODE"];

function executable(command: string): string | undefined {
  const paths = command.includes("/") ? [command]
    : (process.env.PATH ?? "").split(delimiter).map((directory) => join(directory, command));
  return paths.find((path) => {
    try { accessSync(path, constants.X_OK); return true; } catch { return false; }
  });
}

// Both shells and Claude's hook runner interpret this command; quote absolute paths safely.
function quote(value: string): string { return `'${value.replaceAll("'", "'\\''")}'`; }

function dimensions(cols: unknown, rows: unknown): { cols: number; rows: number } | undefined {
  if (typeof cols !== "number" || typeof rows !== "number" || !Number.isInteger(cols)
    || !Number.isInteger(rows) || cols < 2 || cols > 500 || rows < 2 || rows > 300) return;
  return { cols, rows };
}

export function createPtyServer(port: number): { sockets: WebSocketServer; dispose: () => void } {
  const temporary = mkdtempSync(join(tmpdir(), "agent-character-"));
  const settings = join(temporary, "claude-settings.json");
  const command = `${quote(process.execPath)} ${quote(join(root, "adapters/claude-code/hook.mjs"))}`;
  const hooks = Object.fromEntries([
    "SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure", "Notification", "Stop",
  ].map((event) => [event, [{ matcher: "*", hooks: [{ type: "command", command, timeout: 1 }] }]]));
  writeFileSync(settings, JSON.stringify({ hooks }), { mode: 0o600 });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const stopping = new Set<() => void>();
  const kills = new Set<ReturnType<typeof setTimeout>>();
  const groups = new Set<number>();
  let disposed = false;

  function killGroup(pid: number, signal: NodeJS.Signals): void {
    try { process.kill(-pid, signal); } catch { /* Already exited. */ }
  }

  sockets.on("connection", (client, request) => {
    client.on("error", (error) => console.error("PTY WebSocket error:", error.message));
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
    const preset = url.searchParams.get("preset") ?? "shell";
    const fail = (message: string): void => {
      client.send(`\r\n起動できません: ${message}\r\n`, () => client.close(1008, "Preset unavailable"));
    };
    if (!presets.includes(preset as typeof presets[number])) { fail("不明なプリセットです"); return; }
    const program = preset === "shell" ? process.env.SHELL || "/bin/sh" : preset;
    const path = executable(program);
    if (!path) { fail(`${program} が PATH に見つかりません。インストールして server を再起動してください`); return; }
    const args = preset === "claude" ? ["--settings", settings]
      : preset === "pi" ? ["-e", join(root, "adapters/pi/agent-character.ts")] : [];
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
    for (const name of serverOnlyEnvironment) delete env[name];
    env.AGENT_CHARACTER_URL = `http://127.0.0.1:${port}/event`;
    const size = dimensions(Number(url.searchParams.get("cols")), Number(url.searchParams.get("rows")))
      ?? { cols: 80, rows: 24 };
    let terminal;
    try {
      terminal = spawn(path, args, {
        name: "xterm-256color", ...size, env,
        cwd: process.env.AGENT_CHARACTER_CWD || process.env.INIT_CWD || process.cwd(),
      });
    } catch (error) { fail(error instanceof Error ? error.message : String(error)); return; }
    groups.add(terminal.pid);
    let stopped = false;
    const stop = (): void => {
      if (stopped) return;
      stopped = true;
      stopping.delete(stop);
      // node-pty creates a process group on Unix; terminate descendants as well as the CLI.
      killGroup(terminal.pid, "SIGHUP");
      try { terminal.kill(); } catch { /* Already exited. */ }
      const timer = setTimeout(() => {
        killGroup(terminal.pid, "SIGKILL");
        groups.delete(terminal.pid);
        kills.delete(timer);
      }, 500);
      kills.add(timer);
    };
    stopping.add(stop);
    terminal.onData((data) => {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    });
    terminal.onExit(({ exitCode }) => {
      stop();
      if (client.readyState === WebSocket.OPEN) {
        client.send(`\r\n[終了: ${exitCode}]\r\n`, () => client.close(1000, "Process exited"));
      }
    });
    client.on("message", (data, binary) => {
      if (stopped || binary) return;
      try {
        const message = JSON.parse(String(data));
        if (message?.type === "input" && typeof message.data === "string") terminal.write(message.data);
        else if (message?.type === "resize") {
          const size = dimensions(message.cols, message.rows);
          if (size) terminal.resize(size.cols, size.rows);
        }
      } catch { /* Ignore invalid messages and races with process exit. */ }
    });
    client.once("close", stop);
  });
  sockets.on("error", (error) => console.error("PTY server error:", error.message));
  return {
    sockets,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const stop of stopping) stop();
      for (const timer of kills) clearTimeout(timer);
      for (const pid of groups) killGroup(pid, "SIGKILL");
      for (const client of sockets.clients) client.terminate();
      sockets.close();
      rmSync(temporary, { recursive: true, force: true });
    },
  };
}
