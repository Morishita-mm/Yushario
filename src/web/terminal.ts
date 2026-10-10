import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

type Session = {
  id: string; preset: string; cwd: string; project: string; createdAt: number;
  exited?: { code: number };
};

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
  const token = new URLSearchParams(location.search).get("token") ?? "";
  const storageKey = "agent-character-terminal-session";
  let terminal!: Terminal;
  let fit!: FitAddon;
  let socket: WebSocket | undefined;
  let attachedId: string | undefined;
  let sessions: Session[] = [];
  let busy = false;
  const send = (message: object): void => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };
  function resetTerminal(): void {
    terminal?.dispose();
    container.replaceChildren();
    terminal = new Terminal({
      cursorBlink: true, fontSize: 14,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      theme: { background: "#10141c", foreground: "#e4e8f2" },
    });
    fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);
    const current = terminal;
    current.onData((data) => { if (terminal === current) send({ type: "input", data }); });
    current.onResize(({ cols, rows }) => { if (terminal === current) send({ type: "resize", cols, rows }); });
    fit.fit();
  }
  resetTerminal();
  new ResizeObserver(() => { if (container.clientWidth && container.clientHeight) fit.fit(); }).observe(container);
  terminal.writeln("プリセットと作業ディレクトリを選んで「起動」、またはセッションに「接続」してください。");

  function controls(): void {
    start.disabled = refreshButton.disabled = busy;
    connectButton.disabled = end.disabled = busy || !list.value;
  }

  async function api(method: string, suffix = "", body?: object): Promise<Session | Session[] | undefined> {
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

  async function refresh(selected = list.value || attachedId): Promise<void> {
    sessions = await api("GET") as Session[];
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

  function connect(session: Session): void {
    const previous = socket;
    socket = undefined; // Detach old input/receive callbacks before disposing its queued writes.
    previous?.close();
    resetTerminal();
    attachedId = session.id;
    sessionStorage.setItem(storageKey, session.id);
    list.value = session.id;
    status.textContent = `${session.preset} / ${session.id} 接続中…`;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const query = new URLSearchParams({ token, session: session.id, cols: String(terminal.cols), rows: String(terminal.rows) });
    const current = new WebSocket(`${protocol}//${location.host}/pty?${query}`);
    socket = current;
    current.onopen = () => {
      if (socket !== current) return;
      status.textContent = `${session.preset} / ${session.id} 接続済み`;
      terminal.focus();
      send({ type: "resize", cols: terminal.cols, rows: terminal.rows });
    };
    current.onmessage = (event) => { if (socket === current) terminal.write(event.data); };
    current.onerror = () => {
      if (socket !== current) return;
      terminal.writeln("\r\n接続できません。server のトークン付き URL とセッション一覧を確認してください。");
    };
    current.onclose = () => {
      if (socket !== current) return;
      status.textContent = `${session.id} 切断（セッションはサーバーに残ります）`;
      void refresh().then(() => {
        if (socket !== current) return;
        const latest = sessions.find((item) => item.id === session.id);
        if (latest?.exited) status.textContent = `${session.id} 終了 (${latest.exited.code})・出力は保持されています`;
        else if (!latest) status.textContent = "セッションは削除されました";
      }).catch((error: Error) => { if (socket === current) status.textContent = error.message; });
    };
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
    const session = await api("POST", "", { preset: preset.value, ...(cwd.value ? { cwd: cwd.value } : {}) }) as Session;
    connect(session);
    await refresh(session.id);
  }));
  connectButton.addEventListener("click", () => {
    const session = sessions.find((item) => item.id === list.value);
    if (session) connect(session);
  });
  end.addEventListener("click", () => void run(async () => {
    const id = list.value;
    await api("DELETE", `/${encodeURIComponent(id)}`);
    if (id === attachedId) {
      const previous = socket;
      socket = undefined;
      previous?.close();
      attachedId = undefined;
      sessionStorage.removeItem(storageKey);
      status.textContent = "セッションを終了・削除しました";
    }
    await refresh();
  }));
  list.addEventListener("change", controls);
  refreshButton.addEventListener("click", () => void run(() => refresh()));
  window.addEventListener("pagehide", () => socket?.close());
  void run(async () => {
    const remembered = sessionStorage.getItem(storageKey);
    await refresh(remembered ?? undefined);
    const session = sessions.find((item) => item.id === remembered);
    if (session) connect(session);
    else sessionStorage.removeItem(storageKey);
  });
}
