import type { Session } from "../terminal";
import { earlyEquippedExit } from "../../core/session-actions";

export const CLAUDE_SETUP_GUIDANCE = "はじめての時は ターミナルで せっていが ひつようかも。Claude のテーマ・ログイン・フォルダの しんらいなどを たしかめてください。待つだけでは 進まないことが あります。";

// Only the launched/recalled terminal being awaited by the conversation window.
export function initArrival(title: HTMLElement, history: HTMLElement, form: HTMLFormElement, terminal: HTMLButtonElement) {
  const token = new URLSearchParams(location.search).get("token") ?? "";
  let waiting: { id: string; claude: boolean; checked: number; checking: boolean; ended?: string; equipmentHint?: boolean } | undefined;
  const trust = new Set<string>();
  function attention(id: string, active: boolean): void { if (active) trust.add(id); else trust.delete(id); }
  function watch(id?: string, claude = false): void {
    waiting = id ? { id, claude, checked: -Infinity, checking: false } : undefined;
    terminal.classList.remove("terminal-attention"); terminal.textContent = "▶ ターミナル";
  }
  function update(): void {
    const current = waiting;
    if (!current) return;
    const needsTrust = trust.has(current.id);
    title.textContent = current.ended ?? (needsTrust ? "フォルダの しんらい確認が 必要です" : "勇者の 準備を たしかめよう");
    form.hidden = current.ended !== undefined;
    terminal.disabled = false;
    terminal.classList.add("terminal-attention");
    terminal.textContent = current.ended ? "▶ ターミナルで 出力を たしかめる"
      : needsTrust ? "▶ ターミナルで しんらいを こたえる" : "▶ ターミナルで せっていを たしかめる";
    const text = current.ended ? "勇者の CLI が 起動して すぐ 終わりました。理由は ターミナルに のこっています。"
      + (current.equipmentHint
        ? "\nえらんだ そうび（モデル・考える量）を この CLI が しらない かもしれません。CLI を新しくするか、そうびなしで しゅつじんし直してください。"
        : "\nターミナルの 出力を見て 直してから、もう一度 しゅつじんしてください。")
      : needsTrust ? "ターミナルで フォルダの しんらいを こたえてください。待つだけでは 進みません。依頼は 勇者が ついたら つたえます。"
        : `${current.claude ? CLAUDE_SETUP_GUIDANCE : "ターミナルで 起動時の かくにんが ないか たしかめてください。"} 先に書いた 依頼は 準備が できてから つたえます。`;
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
        current.ended = `勇者は 町に こられなかった（終了コード ${session?.exited?.code ?? "不明"}）`;
        current.equipmentHint = session !== undefined && earlyEquippedExit(session, Date.now());
        update();
      }
    }).catch(() => { /* A transient API error is not proof that the hero ended. */ })
      .finally(() => { current.checking = false; });
  }
  return { watch, update, attention };
}
