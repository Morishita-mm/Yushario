#!/usr/bin/env node

const help = `Usage / 使い方: yushario [--port <1-65535>] [--no-open] [--mobile <host:port>]
  --help, -h     Show help and exit / 使い方を表示して終了
  --port        First port to try (default 8790) / 最初に試すポート（既定8790）
  --no-open     Do not open a browser / ブラウザを自動で開かない
  --mobile      Enable separate phone gateway at host:port (default off)
                スマホ窓口の待受（例 127.0.0.1:8791、IPv6 [::1]:8791）。既定は停止
  PORT          Default port; --port overrides it / ポートの既定値（--port が優先）
  AGENT_CHARACTER_HOME  Data folder (default ~/.config/agent-character)
                        データフォルダ（既定 ~/.config/agent-character）
  quest --help  Party tools inside a hero terminal / 勇者の端末の 管理の道具`;

async function questTool(args) {
  const json = args.includes("--json");
  try {
    const action = args[0] ?? "read", input = {};
    if (action === "--help" || action === "-h") {
      console.log("yushario quest read|note|send|invite|review [--quest <id>] [--session <id>] [--text <text>] [--role implement|review|research|test|command] [--note <text>] [--preset <kind> --cwd <path>] [--json]\nInvitations await human approval / 仲間の招待と役割の変更には、人の承認が必要"); return;
    }
    if (!["read", "note", "send", "invite", "review"].includes(action)) throw new Error("That action is not allowed / そのコマンドは使えません");
    for (let i = 1; i < args.length; i++) {
      if (args[i] === "--json") continue;
      if (!["--quest", "--session", "--text", "--role", "--note", "--preset", "--cwd"].includes(args[i]) || args[i + 1] === undefined) throw new Error("Unknown or missing option / 不明なオプション、または指定不足");
      input[args[i].slice(2)] = args[++i];
    }
    const token = process.env.AGENT_CHARACTER_AGENT_TOKEN, session = process.env.AGENT_CHARACTER_SESSION;
    if (!token || !session) throw new Error("Run inside your hero's terminal / 勇者のターミナルで実行してください");
    const base = new URL(process.env.AGENT_CHARACTER_URL ?? "");
    if (base.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(base.hostname)) throw new Error("Invalid local server / ローカルサーバーの指定が正しくありません");
    const { quest = "", ...body } = input;
    const path = `/api/agent/quests${quest ? `/${encodeURIComponent(quest)}` : "/current"}/${action}`;
    const response = await fetch(new URL(path, base.origin), { method: action === "read" ? "GET" : "POST",
      headers: { Authorization: `Bearer ${token}`, "X-Agent-Session": session, "Content-Type": "application/json" },
      ...(action !== "read" ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(value.error ?? `Refused / ことわられた (${response.status})`);
    if (json) console.log(JSON.stringify(value));
    else if (action === "read") console.log(`${value.title}\n${value.purpose}\n${value.state}\n${value.party.map((member) => `${member.session} · ${member.name} · ${member.role}${member.writer ? " · writer / かきかえ役" : ""}`).join("\n")}\n${value.events.slice(0, 10).map((event) => event.title).join("\n")}`);
    else console.log(value.message ?? (value.delivered === false ? "Held / あずかった" : "Saved / のこした"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (json) console.log(JSON.stringify({ error: message })); else console.error(message);
    process.exitCode = 1;
  }
}
if (process.argv[2] === "quest") { await questTool(process.argv.slice(3)); }
else {
let phase = "startup";
let directory;
try {
  const { MINIMUM_NODE_VERSION, parseStartupOptions, supportedNodeVersion } = await import("../lib/core/startup.js");
  if (!supportedNodeVersion(process.versions.node)) {
    console.error(`Node.js ${MINIMUM_NODE_VERSION}+ is required (current: ${process.versions.node}). Update Node.js.`);
    console.error(`Node.js ${MINIMUM_NODE_VERSION} 以上が必要です（今: ${process.versions.node}）。Node.js を更新してください。`);
    process.exitCode = 1;
  } else {
    const result = parseStartupOptions(process.argv.slice(2), process.env.PORT, process.env.NODE_ENV !== "development");
    if ("help" in result) console.log(help);
    else if ("error" in result) {
      console.error(`${result.error} Use --help.`);
      console.error(`${result.japanese} --help を見てください。`);
      process.exitCode = 1;
    } else {
      const startup = await import("../lib/server/startup.js");
      directory = startup.dataDirectory;
      phase = "data";
      startup.prepareDataDirectory();
      phase = "pty";
      await import("node-pty");
      phase = "server";
      await import("../lib/server/relay.js");
    }
  }
} catch (error) {
  if (error instanceof Error && error.name === "QuestDatabaseError") {
    console.error(error.message);
  } else if (phase === "data") {
    console.error(`Cannot create or write data folder: ${directory}. Start with AGENT_CHARACTER_HOME=<writable-folder>.`);
    console.error(`データフォルダを作成・書き込みできません: ${directory}。AGENT_CHARACTER_HOME=<書けるフォルダ> で起動してください。`);
  } else if (phase === "pty") {
    console.error("Cannot load node-pty. Use macOS/Linux and Node.js 22.13+; run npm cache clean --force, then reinstall yushario.");
    console.error("ターミナル部品を読み込めません。macOS・Linux / Node.js 22.13 以上で、npm cache clean --force の後に yushario を入れ直してください。");
  } else {
    const message = (error instanceof Error ? error.message : String(error)).split(/[\r\n]/)[0];
    console.error(`Could not start yushario: ${message}. Use YUSHARIO_DEBUG=1 for details.`);
    console.error("yushario を起動できませんでした。YUSHARIO_DEBUG=1 で詳しい情報を見られます。");
  }
  if (process.env.YUSHARIO_DEBUG === "1") console.error(error);
  // An import can fail after a listener was opened; never leave a half-started server running.
  process.exit(1);
}
}
