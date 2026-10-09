import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AgentState } from "../../src/core/events";

function send(state: AgentState, detail: string, tool?: string): void {
  try {
    void fetch(process.env.AGENT_CHARACTER_URL ?? "http://127.0.0.1:8790/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, detail, tool: tool?.slice(0, 200), source: "pi", ts: Date.now() }),
      signal: AbortSignal.timeout(500),
      redirect: "error",
    }).then((response) => response.body?.cancel()).catch(() => {});
  } catch {
    // Neither synchronous setup failures nor rejected requests may affect Pi.
  }
}

// Lifecycle contracts: docs/extensions.md and dist/core/extensions/types.d.ts
// in @earendil-works/pi-coding-agent. Every handler returns immediately.
export default function (pi: ExtensionAPI): void {
  pi.on("agent_start", () => { send("thinking", "Agent started"); });
  pi.on("tool_call", (event) => { send("working", "Tool started", event.toolName); });
  pi.on("tool_result", (event) => {
    send(event.isError ? "error" : "working", event.isError ? "Tool failed" : "Tool finished", event.toolName);
  });
  pi.on("agent_end", () => { send("success", "Agent finished"); });
  pi.on("ui_prompt_start", () => { send("waiting_input", "Input requested"); });
  pi.on("ui_prompt_end", () => { send("thinking", "Input received"); });
}
