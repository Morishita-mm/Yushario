import { tr } from "../language";
import { normalizeHeroName, validHeroNames } from "../../core/names";

const token = new URLSearchParams(location.search).get("token") ?? "";

export function parseNames(value: unknown): Record<string, string> | undefined {
  if (validHeroNames(value)) return value;
}

export async function loadNames(): Promise<Record<string, string>> {
  const response = await fetch(`/api/names?${new URLSearchParams({ token })}`, { cache: "no-store" });
  if (!response.ok) throw new Error(tr("勇者の名前を 読み込めなかった。", "Could not load hero names."));
  const names = parseNames(await response.json());
  if (!names) throw new Error(tr("勇者の名前を 読み込めなかった。", "Could not load hero names."));
  return names;
}

export function initNameEditor(selected: () => string | undefined, changed: (names: Record<string, string>) => void) {
  const button = document.querySelector<HTMLButtonElement>("#strength-rename")!;
  const form = document.querySelector<HTMLFormElement>("#name-form")!;
  const input = document.querySelector<HTMLInputElement>("#hero-name")!;
  const save = document.querySelector<HTMLButtonElement>("#name-save")!;
  const status = document.querySelector<HTMLElement>("#name-status")!;
  let busy = false;
  button.addEventListener("click", () => { form.hidden = !form.hidden; if (!form.hidden) { input.focus(); input.select(); } });
  document.querySelector("#name-cancel")!.addEventListener("click", () => { form.hidden = true; button.focus(); });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const id = selected(), name = normalizeHeroName(input.value);
    if (!id || busy) return;
    if (name === undefined) { status.textContent = tr("名前は 24文字まで。", "Names may have up to 24 characters."); return; }
    busy = true; save.disabled = true; status.textContent = tr("ほぞん中…", "Saving…");
    void fetch(`/api/names/${encodeURIComponent(id)}?${new URLSearchParams({ token })}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    }).then(async (response) => {
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? tr("名前を 保存できなかった。", "Could not save the name."));
      }
      // Read the canonical map rather than assuming a PUT response shape.
      changed(await loadNames());
      if (selected() !== id) return;
      status.textContent = name ? tr("なまえを かえた！", "Name changed!") : tr("じどうの なまえに もどした！", "Default name restored!");
      form.hidden = true; button.focus();
    }).catch((error: unknown) => {
      if (selected() === id) status.textContent = error instanceof Error ? error.message : String(error);
    }).finally(() => { busy = false; save.disabled = false; });
  });
  return {
    reset: (name: string) => { input.value = name; form.hidden = true; status.textContent = ""; },
    available: (available: boolean) => { button.disabled = !available; if (!available) form.hidden = true; },
  };
}
