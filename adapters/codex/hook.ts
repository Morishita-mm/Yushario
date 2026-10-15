import { codexEvent } from "../../src/core/codex";

// Observation only: never return a policy decision or model-visible context.
const deadline = setTimeout(() => process.exit(0), 700);
try {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 1024 * 1024) process.exit(0);
    chunks.push(buffer);
  }
  const event = codexEvent(JSON.parse(Buffer.concat(chunks).toString("utf8")), {
    terminal: process.env.AGENT_CHARACTER_SESSION, project: process.env.AGENT_CHARACTER_PROJECT,
  }, Date.now());
  const url = process.env.AGENT_CHARACTER_URL;
  if (event && url) await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json", ...(process.env.AGENT_CHARACTER_AGENT_TOKEN
      ? { Authorization: `Bearer ${process.env.AGENT_CHARACTER_AGENT_TOKEN}` } : {}) },
    body: JSON.stringify(event), signal: AbortSignal.timeout(500), redirect: "error",
  });
} catch {
  // Malformed input, missing relay and timeout must not change Codex's work.
} finally {
  clearTimeout(deadline);
  // Stop requires JSON on stdout. An empty object also leaves permissions to Codex.
  process.stdout.write("{}\n");
}
