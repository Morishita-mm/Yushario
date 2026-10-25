import { tr } from "../language";
import { sessionRequest } from "../terminal";

// Texts a hero has not received yet, from the WS `pending` message. Notices on screen repaint in place.
const held = new Map<string, string[]>(), notices = new Set<{ session: string; root: HTMLElement }>();

function paint(session: string, root: HTMLElement): void {
  const texts = held.get(session) ?? [];
  root.hidden = !texts.length; root.replaceChildren();
  if (!texts.length) return;
  const line = texts[0].split("\n")[0].slice(0, 60), more = texts.length > 1 ? ` (+${texts.length - 1})` : "";
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = tr("取り消す", "Cancel");
  cancel.onclick = () => { cancel.disabled = true; void sessionRequest("DELETE", `/${encodeURIComponent(session)}/pending`).catch((error: Error) => { root.title = error.message; cancel.disabled = false; }); };
  root.append(`${tr("送信待ち（勇者の準備待ち）", "Held (waiting for the hero)")}: ${line}${more} `, cancel);
}
export function setHeld(session: string, texts: string[]): void {
  held.set(session, texts);
  for (const notice of notices) { if (!notice.root.isConnected && notices.size > 50) notices.delete(notice); else if (notice.session === session) paint(session, notice.root); }
}
export function heldNotice(session: string): HTMLElement {
  const root = document.createElement("p"); root.className = "hint pending-notice"; root.setAttribute("role", "status");
  notices.add({ session, root }); paint(session, root); return root;
}
