import { checkMark, type CheckCandidate, type QuestCheck, type WorkFingerprint } from "../../core/checks";
import type { Quest } from "../../core/quests";
import { tr } from "../language";
import { checkMarks, checkMarkLabel } from "./check-marks";

export type ChecksData = { quest?: string; checks: QuestCheck[]; fingerprint?: WorkFingerprint; candidates?: CheckCandidate[] };
const token = new URLSearchParams(location.search).get("token") ?? "";
export async function checksRequest(path: string, method = "GET", body?: unknown): Promise<ChecksData> {
  const response = await fetch(`/api/quests/${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`, {
    method, cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error ?? tr("合格条件を よめない", "Cannot read acceptance checks")); }
  return response.status === 204 ? { checks: [] } : response.json();
}
export async function confirmChecksDone(quest: Quest): Promise<boolean> {
  const data = quest.id.startsWith("mock-") ? quest : await checksRequest(`${encodeURIComponent(quest.id)}/checks`);
  const missing = (data.checks ?? []).filter((check) => checkMark(check.evidence, data.fingerprint) !== "passed");
  return !missing.length || confirm(tr("まだ ごうかくしていない 合格条件が ある。受け取る？", "Some acceptance checks have not passed. Accept anyway?"));
}
export function questChecks(quest: Quest): HTMLElement {
  const box = document.createElement("section"); box.className = "quest-checks";
  let data: ChecksData = { checks: quest.checks ?? [], fingerprint: quest.fingerprint };
  const mock = quest.id.startsWith("mock-");
  function render(): void {
    box.replaceChildren();
    const heading = document.createElement("h4"); heading.textContent = tr("合格条件", "Acceptance checks"); box.append(heading);
    if (!data.fingerprint) { const unknown = document.createElement("p"); unknown.className = "hint"; unknown.textContent = tr("じょうたい ふめい", "State unknown"); box.append(unknown); }
    for (const check of data.checks) {
      const row = document.createElement("div"); row.className = "quest-check-row";
      const command = document.createElement("code"); command.textContent = check.command;
      const mark = checkMarks([check], data.fingerprint), text = document.createElement("small"); text.textContent = checkMarkLabel(checkMark(check.evidence, data.fingerprint));
      const remove = document.createElement("button"); remove.type = "button"; remove.textContent = tr("けす", "Remove");
      remove.onclick = () => { remove.disabled = true; void change("DELETE", check.id).catch((error: Error) => { status.textContent = error.message; remove.disabled = false; }); };
      row.append(mark, text, command, remove); box.append(row);
    }
    const status = document.createElement("p"); status.setAttribute("role", "status");
    const form = document.createElement("form"); form.className = "quest-check-form";
    form.oninput = () => { form.dataset.dirty = "true"; };
    const name = document.createElement("input"), command = document.createElement("input");
    name.maxLength = 80; command.maxLength = 200; name.required = command.required = true;
    for (const [text, input] of [[tr("名前", "Name"), name], [tr("コマンドの形", "Command shape"), command]] as const) {
      const label = document.createElement("label"); label.append(document.createTextNode(text), input); form.append(label);
    }
    const add = document.createElement("button"); add.type = "submit"; add.textContent = tr("＋ 合格条件を 足す", "＋ Add acceptance check"); form.append(add);
    form.onsubmit = (event) => { event.preventDefault(); add.disabled = true;
      void change("POST", undefined, { name: name.value.trim(), command: command.value.trim() }).catch((error: Error) => { status.textContent = error.message; add.disabled = false; });
    }; box.append(form);
    if (data.candidates?.length) {
      const title = document.createElement("p"); title.textContent = tr("package.json の 候補", "From package.json");
      const choices = document.createElement("div"); choices.className = "check-candidates";
      for (const candidate of data.candidates) {
        const button = document.createElement("button"); button.type = "button"; button.textContent = `＋ ${candidate.command}`;
        button.disabled = data.checks.some((check) => check.command === candidate.command);
        button.onclick = () => { button.disabled = true; void change("POST", undefined, candidate).catch((error: Error) => { status.textContent = error.message; button.disabled = false; }); }; choices.append(button);
      }
      box.append(title, choices);
    }
    box.append(status);
  }
  async function change(method: "POST" | "DELETE", id?: string, candidate?: CheckCandidate): Promise<void> {
    if (mock) {
      data.checks = method === "DELETE" ? data.checks.filter((check) => check.id !== id) : [...data.checks, { id: crypto.randomUUID(), ...candidate! }];
      quest.checks = data.checks;
    } else {
      await checksRequest(`${encodeURIComponent(quest.id)}/checks${id ? `/${encodeURIComponent(id)}` : ""}`, method, candidate);
      data = await checksRequest(`${encodeURIComponent(quest.id)}/checks`);
    }
    render();
  }
  render();
  if (!mock) void checksRequest(`${encodeURIComponent(quest.id)}/checks`).then((result) => {
    data = result;
    if (!box.querySelector('[data-dirty="true"]') && !box.contains(document.activeElement)) render();
  })
    .catch((error: Error) => { const status = document.createElement("p"); status.textContent = error.message; box.append(status); });
  return box;
}
export function reportChecks(session: string, at: number): HTMLElement {
  const root = document.createElement("div"); root.className = "report-checks";
  void checksRequest(`checks-report?session=${encodeURIComponent(session)}&at=${at}`).then((data) => {
    root.replaceChildren(checkMarks(data.checks, data.fingerprint));
    if (data.checks.length && !data.fingerprint) { const unknown = document.createElement("small"); unknown.textContent = tr("じょうたい ふめい", "State unknown"); root.append(unknown); }
  }).catch(() => undefined);
  return root;
}
