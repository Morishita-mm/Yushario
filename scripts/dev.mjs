import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

const token = process.env.AGENT_CHARACTER_TOKEN || randomBytes(32).toString("hex");
const webPort = process.env.VITE_PORT ?? "5173";
const env = { ...process.env, NODE_ENV: "development", AGENT_CHARACTER_TOKEN: token };
console.log(`Open http://127.0.0.1:${webPort}/?token=${encodeURIComponent(token)}`);
// Launch both Node processes directly so shutdown does not leave npm shell children.
const children = [
  spawn(process.execPath, ["--import", "tsx", "scripts/dev-relay.mjs", ...process.argv.slice(2)], { stdio: "inherit", env }),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", webPort, "--strictPort"], { stdio: "inherit", env }),
];
let stopping = false;

function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  }
}

for (const child of children) {
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => stop(code ?? 1));
}
process.on("SIGINT", () => stop(130));
process.on("SIGTERM", () => stop(143));
