import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export function initTerminal(): void {
  const container = document.querySelector<HTMLElement>("#terminal")!;
  const preset = document.querySelector<HTMLSelectElement>("#preset")!;
  const start = document.querySelector<HTMLButtonElement>("#start")!;
  const status = document.querySelector<HTMLElement>("#terminal-status")!;
  const terminal = new Terminal({
    cursorBlink: true, fontSize: 14,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    theme: { background: "#10141c", foreground: "#e4e8f2" },
  });
  const fit = new FitAddon();
  terminal.loadAddon(fit);
  terminal.open(container);
  let socket: WebSocket | undefined;
  const send = (message: object): void => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };
  terminal.onData((data) => send({ type: "input", data }));
  terminal.onResize(({ cols, rows }) => send({ type: "resize", cols, rows }));
  new ResizeObserver(() => { if (container.clientWidth && container.clientHeight) fit.fit(); }).observe(container);
  fit.fit();
  terminal.writeln("プリセットを選んで「起動」を押してください。");

  start.addEventListener("click", () => {
    socket?.close();
    terminal.reset();
    fit.fit();
    status.textContent = "起動中…";
    start.textContent = "再起動";
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const query = new URLSearchParams({
      token: new URLSearchParams(location.search).get("token") ?? "",
      preset: preset.value, cols: String(terminal.cols), rows: String(terminal.rows),
    });
    const current = new WebSocket(`${protocol}//${location.host}/pty?${query}`);
    socket = current;
    current.onopen = () => {
      if (socket !== current) return;
      status.textContent = `${preset.value} 接続済み`;
      terminal.focus();
      send({ type: "resize", cols: terminal.cols, rows: terminal.rows });
    };
    current.onmessage = (event) => { if (socket === current) terminal.write(event.data); };
    current.onerror = () => {
      if (socket !== current) return;
      terminal.writeln("\r\n接続できません。server のトークン付き URL から開き直してください。");
    };
    current.onclose = () => {
      if (socket === current) status.textContent = "終了・切断（再起動できます）";
    };
  });
  window.addEventListener("pagehide", () => socket?.close());
}
