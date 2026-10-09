type BubbleButton = { label: string; action: () => void };

export class Bubble {
  private readonly element = document.createElement("div");
  private permissionId: string | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(parent: HTMLElement) {
    this.element.className = "bubble";
    this.element.hidden = true;
    this.element.setAttribute("role", "status");
    this.element.setAttribute("aria-live", "polite");
    parent.append(this.element);
    this.element.addEventListener("click", () => {
      if (!this.permissionId) this.close();
    });
  }

  show(text: string, buttons: BubbleButton[] = [], permissionId?: string): void {
    if (this.permissionId && !permissionId) return;
    clearTimeout(this.timer);
    this.permissionId = permissionId;
    this.element.replaceChildren();
    const message = document.createElement("p");
    message.textContent = text;
    this.element.append(message);
    if (buttons.length) {
      const actions = document.createElement("div");
      actions.className = "bubble-actions";
      for (const { label, action } of buttons) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.addEventListener("click", (event) => { event.stopPropagation(); action(); });
        actions.append(button);
      }
      this.element.append(actions);
    }
    this.element.hidden = false;
    if (!permissionId) this.timer = setTimeout(() => this.close(), 7000);
  }

  close(permissionId?: string): void {
    if (this.permissionId && permissionId !== this.permissionId) return;
    clearTimeout(this.timer);
    this.permissionId = undefined;
    this.element.hidden = true;
  }
}
