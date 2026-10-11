#!/usr/bin/env node

const help = `Usage / 使い方: agent-quest [--port <1-65535>] [--no-open]
  --help, -h     Show help and exit / 使い方を表示して終了
  --port        First port to try (default 8790) / 最初に試すポート（既定8790）
  --no-open     Do not open a browser / ブラウザを自動で開かない
  PORT          Default port; --port overrides it / ポートの既定値（--port が優先）
  AGENT_CHARACTER_HOME  Data folder (default ~/.config/agent-character)
                        データフォルダ（既定 ~/.config/agent-character）`;

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
  if (phase === "data") {
    console.error(`Cannot create or write data folder: ${directory}. Start with AGENT_CHARACTER_HOME=<writable-folder>.`);
    console.error(`データフォルダを作れないか書けません: ${directory}。AGENT_CHARACTER_HOME=<書けるフォルダ> で起動してください。`);
  } else if (phase === "pty") {
    console.error("Cannot load node-pty. Use macOS/Linux and Node.js 22.12+; run npm cache clean --force, then reinstall agent-quest.");
    console.error("ターミナル部品を読み込めません。macOS・Linux / Node.js 22.12 以上で、npm cache clean --force の後に agent-quest を入れ直してください。");
  } else {
    const message = (error instanceof Error ? error.message : String(error)).split(/[\r\n]/)[0];
    console.error(`Could not start agent-quest: ${message}. Use AGENT_QUEST_DEBUG=1 for details.`);
    console.error("agent-quest を起動できませんでした。AGENT_QUEST_DEBUG=1 で詳しい情報を見られます。");
  }
  if (process.env.AGENT_QUEST_DEBUG === "1") console.error(error);
  // An import can fail after a listener was opened; never leave a half-started server running.
  process.exit(1);
}
