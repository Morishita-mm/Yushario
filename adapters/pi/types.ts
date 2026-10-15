// Read-only subset used by this adapter, from pi's docs/extensions.md and
// core/extensions/types.d.ts. No SDK runtime or dependency is bundled here.
export type ExtensionContext = {
  cwd: string;
  signal: AbortSignal | undefined;
  sessionManager: { getSessionId(): string };
  getContextUsage(): { percent: number | null } | undefined;
};

type ToolInput = { toolName: string; input: Record<string, unknown> };
type AssistantMessage = {
  role: "assistant";
  content: ({ type: "text"; text: string } | { type: "thinking" | "image" | "toolCall" })[];
};
type OtherMessage = { role: "system" | "user" | "toolResult" | "bashExecution" | "custom" | "branchSummary" | "compactionSummary" };
type Events = {
  session_start: { type: "session_start" };
  before_agent_start: { type: "before_agent_start"; prompt: string };
  input: { type: "input"; text: string; streamingBehavior?: "steer" | "followUp" };
  agent_start: { type: "agent_start" };
  before_provider_request: { type: "before_provider_request" };
  tool_call: { type: "tool_call" } & ToolInput;
  tool_result: { type: "tool_result"; isError: boolean } & ToolInput;
  agent_end: { type: "agent_end"; messages: (AssistantMessage | OtherMessage)[] };
  agent_before_settle: { type: "agent_before_settle"; outcome: "completed" | "aborted" | "error" };
  agent_settled: { type: "agent_settled" };
  session_before_compact: { type: "session_before_compact" };
  session_compact: { type: "session_compact"; willRetry: boolean };
  session_compact_failed: { type: "session_compact_failed"; willRetry: boolean; aborted: boolean };
  ui_prompt_start: { type: "ui_prompt_start" };
  ui_prompt_end: { type: "ui_prompt_end" };
  session_shutdown: { type: "session_shutdown"; reason: "quit" | "reload" | "new" | "resume" | "fork" };
};
export type ExtensionAPI = {
  on<K extends keyof Events>(event: K, handler: (event: Events[K], ctx: ExtensionContext) => void | Promise<void>): () => void;
};
