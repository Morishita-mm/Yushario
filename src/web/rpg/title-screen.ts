import "./title-screen.css";

// Page-only title screen: sessionStorage remembers this tab, never the server.
export function initTitleScreen(): void {
  const screen = document.querySelector<HTMLDialogElement>("#title-screen")!;
  const key = "agent-quest-title-seen";
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch { /* Storage can be unavailable; the map must still be usable. */ }

  function finish(): void {
    screen.close();
    screen.removeEventListener("click", finish);
    window.removeEventListener("keydown", start, true);
    document.querySelector<HTMLButtonElement>("#expedition")!.focus({ preventScroll: true });
  }
  function start(event: KeyboardEvent): void {
    if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey
      || ["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(event.key)) return;
    // The start key belongs to the title, not map shortcuts or the focused button.
    event.preventDefault();
    event.stopImmediatePropagation();
    finish();
  }
  screen.addEventListener("click", finish);
  screen.addEventListener("cancel", (event) => { event.preventDefault(); finish(); }, { once: true });
  window.addEventListener("keydown", start, true);
  screen.showModal();
}
