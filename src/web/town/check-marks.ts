import { checkMark, type CheckMark, type QuestCheck, type WorkFingerprint, type CheckEvidence } from "../../core/checks";
import { clock, tr } from "../language";
import "./checks.css";

export const checkMarkLabel = (mark: CheckMark): string => ({ unrun: tr("みじっこう", "Not run"), passed: tr("ごうかく", "Passed"), failed: tr("しっぱい", "Failed"), stale: tr("ふるい", "Stale"), unknown: tr("ふめい", "Unknown") })[mark];
const symbols: Record<CheckMark, string> = { unrun: "·", passed: "✔", failed: "✖", stale: "↺", unknown: "?" };
export function evidenceView(evidence?: CheckEvidence): HTMLElement {
  const box = document.createElement("div"); box.className = "check-evidence";
  if (!evidence) { box.textContent = tr("まだ ためしていない", "Not tried yet"); return box; }
  const command = document.createElement("pre"); command.textContent = evidence.command;
  const facts = document.createElement("p"); facts.textContent = `${evidence.passed === undefined ? tr("ふめい", "Unknown") : evidence.passed ? tr("成功", "Success") : tr("失敗", "Failure")} · ${clock(evidence.at, true)} · ${evidence.hero ?? evidence.session}`;
  const state = document.createElement("p"); state.textContent = evidence.fingerprint ? `HEAD ${evidence.fingerprint.head.slice(0, 8)}` : tr("じょうたい ふめい", "State unknown");
  const base = document.createElement("p"); base.textContent = `${tr("拠点", "Base")} · ${evidence.base ?? tr("ふめい", "Unknown")}`;
  box.append(command, facts, state, base); return box;
}
function openEvidence(check: QuestCheck): void {
  const dialog = document.createElement("dialog"); dialog.className = "check-evidence-window";
  const title = document.createElement("h3"); title.textContent = check.name;
  const close = document.createElement("button"); close.type = "button"; close.textContent = tr("▶ とじる", "▶ Close"); close.onclick = () => dialog.close();
  dialog.append(title, evidenceView(check.evidence), close); document.body.append(dialog);
  dialog.addEventListener("keydown", (event) => event.stopPropagation());
  dialog.addEventListener("close", () => dialog.remove()); dialog.showModal();
}
export function checkMarks(checks: QuestCheck[] = [], fingerprint?: WorkFingerprint, inline = false): HTMLElement {
  const box = document.createElement("span"); box.className = "check-marks";
  for (const check of checks) {
    const mark = checkMark(check.evidence, fingerprint);
    const item = document.createElement(inline ? "span" : "button"); item.className = `check-mark check-${mark}`;
    if (item instanceof HTMLButtonElement) item.type = "button";
    else { item.tabIndex = 0; item.setAttribute("role", "button"); item.onkeydown = (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); openEvidence(check); }
    }; }
    item.textContent = `${check.name} ${symbols[mark]}`;
    const unknown = !fingerprint?.base || Boolean(check.evidence && (!check.evidence.base || !check.evidence.fingerprint?.base));
    item.title = `${checkMarkLabel(mark)}${unknown ? ` · ${tr("じょうたい ふめい", "State unknown")}` : ""}`;
    item.setAttribute("aria-label", `${check.name} · ${item.title}`);
    item.onclick = (event) => { event.stopPropagation(); openEvidence(check); }; box.append(item);
  }
  return box;
}
