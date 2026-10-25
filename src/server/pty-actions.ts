import { tr } from "./language";
import type { AgentEvent } from "../core/events";
import { isClaudeSessionId } from "../core/roster";
import { askingAfterEvent, waitingAfterEvent, type SessionAction } from "../core/session-actions";
import type { PendingMessage, Session } from "./pty-session";
import { AGENTS } from "./agents";
import { conversationText } from "../core/terminal-session";

export function parseSessionAction(input: unknown): SessionAction {
  const action = input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>).action : undefined;
  if (action !== "interrupt" && action !== "compact" && action !== "farewell") throw new Error(tr("勇者のコマンドが 正しくない。", "Invalid hero command"));
  return action;
}

export function pending(session: Session): PendingMessage {
  return { type: "pending", terminal: session.info.id, texts: [...session.texts],
    ...(session.pendingEquipment ? { equipment: session.pendingEquipment } : {}) };
}

export function clearPending(session: Session, changed: (message: PendingMessage) => void): void {
  if (!session.texts.length && !session.pendingEquipment) return;
  session.texts = []; session.pendingEquipment = undefined;
  changed(pending(session));
}

export function clearTexts(session: Session, changed: (message: PendingMessage) => void): void {
  session.texts = [];
  changed(pending(session));
}

function cancelEnter(session: Session): void {
  clearTimeout(session.enter);
  session.enter = undefined;
}

function enterSoon(session: Session): void {
  session.waiting = false; // Reserve the turn, including the delay before Enter.
  session.enter = setTimeout(() => {
    session.enter = undefined;
    if (session.info.exited || session.ended || session.asking) return;
    try { session.terminal.write("\r"); }
    catch (error) { console.error("PTY delivery failed:", error); }
  }, 300);
}

// Paste conversation text as one block: its newlines/control bytes must not become commands.
export function deliver(session: Session, text: string): void {
  const body = conversationText(text);
  // Claude restores the interrupted prompt as a draft after Esc; do not append the new request to it.
  const agent = AGENTS[session.info.preset];
  if (session.interrupted && agent.restoresDraft) session.terminal.write(agent.clearDraft);
  session.terminal.write(`\x1b[200~${body}\x1b[201~`);
  session.interrupted = false;
  enterSoon(session);
}

export function say(session: Session, text: string, changed: (message: PendingMessage) => void, steer = false): boolean {
  if (session.info.exited || session.ended || session.departing || session.interrupting) throw new Error(tr("この勇者は いま はなせない", "This hero cannot talk now"));
  if (steer && (!session.hasMainHook || session.asking)) throw new Error(tr("起動と へんじを ターミナルで たしかめて", "Check startup and answer prompts in the terminal first"));
  text = conversationText(text);
  if (!text || text.length > 8000) throw new Error(tr("ことばは 1〜8000文字で", "Use 1–8000 characters"));
  const delivered = !session.asking && (session.waiting || steer);
  if (delivered) deliver(session, text);
  else { session.texts.push(text); changed(pending(session)); }
  return delivered;
}

export function observe(session: Session, event: AgentEvent, at: number,
  changed: (message: PendingMessage) => void, flushEquipment?: (sendHeldText: boolean) => void): void {
  const wasAsking = session.asking, asking = askingAfterEvent(event);
  // Hooks run concurrently: an older hook arriving late must not clear a newer prompt.
  if (asking !== undefined && at >= session.askedAt) { session.asking = asking; session.askedAt = at; }
  if (session.info.exited || session.ended || event.subagent) return;
  if (event.hook && event.hook !== "PartyRequest") session.hasMainHook = true;
  if (AGENTS[session.info.preset].hero && isClaudeSessionId(event.agent)) {
    session.agentId = event.agent;
    if (event.hook === "UserPromptSubmit") session.hasPrompt = true;
    if (event.name) session.name = event.name;
  }
  if (session.departing || at < session.eventAt) return;
  if (event.hook === "SessionEnd") {
    session.ended = true; session.waiting = false; session.interrupting = false;
    cancelEnter(session); clearPending(session, changed); return;
  }
  if (event.hook === "UserPromptSubmit" && event.text) {
    const matching = session.texts.findIndex((text) => conversationText(text) === conversationText(event.text!));
    if (matching >= 0) { session.texts.splice(matching, 1); changed(pending(session)); }
  }
  const waiting = waitingAfterEvent(event, session.interrupted);
  if (session.interrupting) {
    if (waiting !== true && event.hook !== "SessionEnd") return;
    session.interrupting = false;
  }
  if (waiting === undefined && !(wasAsking && !session.asking)) return;
  if (waiting !== undefined) {
    session.eventAt = at;
    if (event.hook === "UserPromptSubmit") session.interrupted = false;
    session.waiting = !session.enter && !session.equipping && waiting;
  }
  if (session.asking) return;
  if (session.waiting && session.pendingEquipment) { flushEquipment?.(event.hook !== "StopFailure"); return; }
  if (session.waiting && session.texts.length && event.hook !== "StopFailure") {
    try { deliver(session, session.texts.join("\n")); clearPending(session, changed); }
    catch (error) { console.error("Conversation delivery failed:", error); }
  }
}

// Type CLI commands normally (not bracketed paste), clearing the editor's draft first.
function command(session: Session, text: string): void {
  session.terminal.write(`${AGENTS[session.info.preset].clearDraft}${text}`);
  enterSoon(session);
}

export async function act(session: Session, action: SessionAction,
  changed: (message: PendingMessage) => void): Promise<void> {
  const agent = AGENTS[session.info.preset];
  if (action === "compact") { command(session, agent.compactCommand); return; }
  const working = !session.waiting;
  cancelEnter(session);
  session.texts = []; session.pendingEquipment = undefined; session.equipping = undefined;
  changed(pending(session));
  if (action === "interrupt" || working) session.terminal.write(agent.interrupt);
  session.interrupted = true;
  session.eventAt = Date.now(); // Ignore hooks already in flight before Esc.
  session.waiting = false;
  if (action === "interrupt") {
    session.interrupting = true; // A later main ready/end hook, not elapsed time, confirms the stop.
    return;
  }
  session.departing = true; // No queued/new turn may race with /exit.
  if (working) await new Promise<void>((resolve) => setTimeout(resolve, 300));
  if (session.info.exited) return;
  command(session, agent.farewell);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([session.finished, new Promise<void>((resolve) => { timeout = setTimeout(resolve, 5000); })]);
    if (!session.info.exited) session.stop();
  } finally { clearTimeout(timeout); }
}
