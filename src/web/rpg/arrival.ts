import { tr } from "../language";
import type { Session } from "../terminal";
import { earlyEquippedExit } from "../../core/session-actions";

export const CLAUDE_SETUP_GUIDANCE = tr("ターミナルで Claude の設定・ログインを たしかめよう。", "Check Claude setup and login in the terminal.");

// Only the launched/recalled terminal being awaited by the conversation window.
export function initArrival(title: HTMLElement, history: HTMLElement, form: HTMLFormElement, terminal: HTMLButtonElement) {
  const token = new URLSearchParams(location.search).get("token") ?? "";
  let waiting: { id: string; claude: boolean; checked: number; checking: boolean; ended?: string; equipmentHint?: boolean } | undefined;
  const trust = new Set<string>();
  function attention(id: string, active: boolean): void { if (active) trust.add(id); else trust.delete(id); }
  function watch(id?: string, claude = false): void {
    waiting = id ? { id, claude, checked: -Infinity, checking: false } : undefined;
    terminal.classList.remove("terminal-attention"); terminal.textContent = tr("▶ ターミナル", "▶ Terminal");
  }
  function update(): void {
    const current = waiting;
    if (!current) return;
    const needsTrust = trust.has(current.id);
    title.textContent = current.ended ?? (needsTrust ? tr("フォルダを信頼するか 返事が必要。", "Folder trust needs your answer") : tr("勇者の 準備を たしかめよう", "Check your hero's readiness"));
    form.hidden = current.ended !== undefined;
    terminal.disabled = false;
    terminal.classList.add("terminal-attention");
    terminal.textContent = current.ended ? tr("▶ ターミナルで 出力を たしかめる", "▶ Check terminal output")
      : needsTrust ? tr("▶ ターミナルで 信頼の確認", "▶ Answer trust in terminal") : tr("▶ ターミナルで せっていを たしかめる", "▶ Check terminal setup");
    const text = current.ended ? tr("勇者の CLI が 起動直後に終了した。出力は ターミナルでたしかめよう。", "Your hero's CLI stopped right away. Check the terminal.")
      + (current.equipmentHint
        ? tr("\nこの CLI は 選んだそうび（モデル・考える量）に未対応かもしれない。CLI を更新するか、そうびなしで しゅつじんし直そう。", "\nThe CLI may not know this equipment. Update it or embark with no equipment.")
        : tr("\nターミナルの出力を見て直したら、もう一度 しゅつじんしよう。", "\nCheck the output, fix the issue, and embark again."))
      : needsTrust ? tr("ターミナルで フォルダを信頼するか こたえよう。", "Answer folder trust in the terminal.")
        : current.claude ? CLAUDE_SETUP_GUIDANCE : tr("ターミナルに 起動時の確認がないか 見てみよう。", "Check for startup questions in the terminal.");
    if (history.textContent !== text) {
      const message = document.createElement("p");
      message.className = "arrival-guidance";
      message.textContent = text; history.replaceChildren(message);
    }
    if (current.ended || current.checking || Date.now() - current.checked < 1000) return;
    current.checked = Date.now(); current.checking = true;
    void fetch(`/api/sessions?token=${encodeURIComponent(token)}`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const sessions = await response.json() as Session[];
      if (waiting !== current) return;
      const session = sessions.find((item) => item.id === current.id);
      if (!session || session.exited) {
        current.ended = tr(`勇者は 町に こられなかった（終了コード ${session?.exited?.code ?? "不明"}）`, `Your hero could not arrive (exit ${session?.exited?.code ?? "unknown"})`);
        current.equipmentHint = session !== undefined && earlyEquippedExit(session, Date.now());
        update();
      }
    }).catch(() => { /* A transient API error is not proof that the hero ended. */ })
      .finally(() => { current.checking = false; });
  }
  return { watch, update, attention };
}
