import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { loadAgents } from "./rpg/agents";

export type Session = {
  id: string; preset: string; cwd: string; project: string; createdAt: number;
  exited?: { code: number; at: number }; weapon?: string; accessory?: string;
};
const token = new URLSearchParams(location.search).get("token") ?? "";

export async function sessionRequest(method = "GET", suffix = "", body?: object): Promise<Session | Session[] | undefined> {
  const response = await fetch(`/api/sessions${suffix}?${new URLSearchParams({ token })}`, {
    method, cache: "no-store",
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error ?? `API ${response.status}（トークン付き URL を確認してください）`);
  }
  return response.status === 204 ? undefined : response.json();
}

function openXterm(container: HTMLElement) {
  container.replaceChildren();
  const terminal = new Terminal({
    cursorBlink: true, fontSize: 14,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    theme: { background: "#10141c", foreground: "#e4e8f2" },
  });
  const fit = new FitAddon();
  terminal.loadAddon(fit);
  terminal.open(container);
  fit.fit();
  const observer = new ResizeObserver(() => {
    if (container.clientWidth && container.clientHeight) fit.fit();
  });
  observer.observe(container);
  return { terminal, dispose: () => { observer.disconnect(); terminal.dispose(); } };
}

// One attachment, shared by the standalone page and the town window.
// Disposing disconnects only the browser; the server keeps the PTY and its output.
export function connectSessionTerminal(container: HTMLElement, session: Session, status: HTMLElement,
  onDisconnect: () => void = () => undefined) {
  const view = openXterm(container);
  const terminal = view.terminal;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const query = new URLSearchParams({ token, session: session.id, cols: String(terminal.cols), rows: String(terminal.rows) });
  const socket = new WebSocket(`${protocol}//${location.host}/pty?${query}`);
  let disposed = false;
  const send = (message: object): void => {
    if (!disposed && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };
  terminal.onData((data) => send({ type: "input", data }));
  terminal.onResize(({ cols, rows }) => send({ type: "resize", cols, rows }));
  status.textContent = `${session.preset} / ${session.id} 接続中…`;
  socket.onopen = () => {
    if (disposed) return;
    status.textContent = session.exited ? `${session.id} 終了 (${session.exited.code})`
      : `${session.preset} / ${session.id} 接続済み`;
    terminal.focus();
    send({ type: "resize", cols: terminal.cols, rows: terminal.rows });
  };
  socket.onmessage = (event) => { if (!disposed) terminal.write(event.data); };
  socket.onerror = () => {
    if (!disposed) terminal.writeln("\r\n接続できません。server のトークン付き URL とセッション一覧を確認してください。");
  };
  socket.onclose = () => {
    if (disposed) return;
    status.textContent = `${session.id} 切断`;
    onDisconnect();
  };
  const disconnect = (): void => { disposed = true; socket.close(); };
  return { disconnect, dispose: () => { disconnect(); view.dispose(); } };
}

export function initTerminal(): void {
  const container = document.querySelector<HTMLElement>("#terminal")!;
  const preset = document.querySelector<HTMLSelectElement>("#preset")!;
  const cwd = document.querySelector<HTMLInputElement>("#cwd")!;
  const start = document.querySelector<HTMLButtonElement>("#start")!;
  const list = document.querySelector<HTMLSelectElement>("#sessions")!;
  const connectButton = document.querySelector<HTMLButtonElement>("#connect-session")!;
  const end = document.querySelector<HTMLButtonElement>("#end-session")!;
  const refreshButton = document.querySelector<HTMLButtonElement>("#refresh-sessions")!;
  const status = document.querySelector<HTMLElement>("#terminal-status")!;
  const storageKey = "agent-character-terminal-session";
  const welcome = openXterm(container);
  welcome.terminal.writeln("プリセットと作業ディレクトリを選んで「起動」、またはセッションに「接続」してください。");
  let attachment: ReturnType<typeof connectSessionTerminal> | undefined;
  let attachedId: string | undefined;
  let sessions: Session[] = [];
  let busy = false;

  function controls(): void {
    start.disabled = busy || !preset.value;
    refreshButton.disabled = busy;
    connectButton.disabled = end.disabled = busy || !list.value;
  }
  async function refresh(selected = list.value || attachedId): Promise<void> {
    sessions = await sessionRequest() as Session[];
    list.replaceChildren(new Option("セッションを選択", ""));
    for (const session of sessions) {
      const option = new Option(`${session.project} / ${session.preset} / ${session.id}${
        session.exited ? ` / 終了 (${session.exited.code})` : ""}`, session.id);
      option.title = session.cwd;
      list.add(option);
    }
    if (sessions.some((session) => session.id === selected)) list.value = selected!;
    controls();
  }
  const dispose = (): void => (attachment ?? welcome).dispose();
  function connect(session: Session): void {
    dispose();
    attachedId = session.id;
    sessionStorage.setItem(storageKey, session.id);
    list.value = session.id;
    // Late callbacks from an earlier attachment (even to the same session) must not touch the status.
    const current = attachment = connectSessionTerminal(container, session, status, () => {
      void refresh().then(() => {
        if (attachment !== current) return;
        const latest = sessions.find((item) => item.id === session.id);
        if (latest?.exited) status.textContent = `${session.id} 終了 (${latest.exited.code})`;
        else if (!latest) status.textContent = "セッションは削除されました";
      }).catch((error: Error) => { if (attachment === current) status.textContent = error.message; });
    });
    controls();
  }
  async function run(action: () => Promise<void>): Promise<void> {
    busy = true;
    controls();
    try { await action(); } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error);
    } finally { busy = false; controls(); }
  }
  start.addEventListener("click", () => void run(async () => {
    status.textContent = "起動中…";
    const session = await sessionRequest("POST", "", { preset: preset.value, ...(cwd.value ? { cwd: cwd.value } : {}) }) as Session;
    connect(session);
    await refresh(session.id);
  }));
  connectButton.addEventListener("click", () => {
    const session = sessions.find((item) => item.id === list.value);
    if (session) connect(session);
  });
  const confirmation = document.createElement("dialog");
  const question = document.createElement("p");
  const no = document.createElement("button"), yes = document.createElement("button");
  no.type = yes.type = "button"; no.textContent = "いいえ"; yes.textContent = "はい";
  confirmation.append(question, no, yes); document.body.append(confirmation);
  confirmation.addEventListener("keydown", (event) => event.stopPropagation());
  no.addEventListener("click", () => confirmation.close());
  let endingId: string | undefined;
  end.addEventListener("click", () => {
    const session = sessions.find((item) => item.id === list.value);
    if (!session) return;
    endingId = session.id;
    question.textContent = `「${session.project} / ${session.preset} / ${session.id}」を 終了して 削除しますか？`;
    confirmation.showModal(); no.focus();
  });
  yes.addEventListener("click", () => { confirmation.close(); void run(async () => {
    const id = endingId;
    if (!id) return;
    await sessionRequest("DELETE", `/${encodeURIComponent(id)}`);
    if (id === attachedId) {
      attachment?.disconnect();
      attachedId = undefined;
      sessionStorage.removeItem(storageKey);
      status.textContent = "セッションを終了・削除しました";
    }
    await refresh();
  }); });
  list.addEventListener("change", controls);
  refreshButton.addEventListener("click", () => void run(() => refresh()));
  window.addEventListener("pagehide", () => dispose());
  void run(async () => {
    const agents = await loadAgents();
    preset.replaceChildren(...agents.map((agent) => new Option(agent.label, agent.id)));
    if (agents.some((agent) => agent.id === "shell")) preset.value = "shell";
    const remembered = sessionStorage.getItem(storageKey);
    await refresh(remembered ?? undefined);
    const session = sessions.find((item) => item.id === remembered);
    if (session) connect(session);
    else sessionStorage.removeItem(storageKey);
  });
}
