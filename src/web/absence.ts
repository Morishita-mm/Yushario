import type { AgentEvent } from "../core/events";

const ABSENCE_THRESHOLD_MS = 60_000;

export function trackAbsence(report: (text: string) => void): (event: AgentEvent) => void {
  let focused = document.hasFocus();
  let since: number | undefined;
  let completed = 0;
  let errors = 0;
  let calls = 0;
  const update = (): void => {
    const absent = document.hidden || !focused;
    if (absent && since === undefined) {
      since = Date.now();
      completed = errors = calls = 0;
    } else if (!absent && since !== undefined) {
      const elapsed = Date.now() - since;
      since = undefined;
      if (elapsed >= ABSENCE_THRESHOLD_MS) {
        report(`いない間に: 完了 ${completed} 回 / エラー ${errors} 回 / 呼び出し ${calls} 回`);
      }
    }
  };
  document.addEventListener("visibilitychange", update);
  window.addEventListener("blur", () => { focused = false; update(); });
  window.addEventListener("focus", () => { focused = true; update(); });
  update();
  return (event) => {
    if (since === undefined) return;
    if (event.state === "success") completed++;
    else if (event.state === "error") errors++;
    else if (event.state === "waiting_input") calls++;
  };
}
