export function initHelp(): void {
  const dialog = document.querySelector<HTMLDialogElement>("#help-dialog")!;
  const equipment = document.createElement("p");
  equipment.textContent = "ぶき＝モデル、アクセサリ＝考える量。そうびなしは 勇者の きほんの設定です。途中で かえられる勇者は、作業が おわってから もちかえます。";
  dialog.querySelector("h3")?.after(equipment);
  const close = () => dialog.close();
  document.querySelector("#help")!.addEventListener("click", () => dialog.showModal());
  document.querySelector("#help-close")!.addEventListener("click", close);
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  dialog.addEventListener("keydown", (event) => event.stopPropagation());
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  });
}
