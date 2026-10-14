import type { MarkdownBlock } from "../../core/markdown";
import type { MarkdownInline } from "../../core/markdown-inline";
import { fileReference } from "../../core/file-path";
import { fileOpen } from "./file-open";

// Build once, then reveal text nodes in document order. Source syntax is never typed out.
export function renderMarkdown(root: HTMLElement, blocks: MarkdownBlock[], shown = Infinity, cwd?: string) {
  root.replaceChildren(); root.classList.add("markdown-body");
  const runs: { node: Text; chars: string[]; start: number; shown: number }[] = [];
  const groups: { node: HTMLElement; start: number; end: number }[] = [];
  let length = 0;
  function text(parent: HTMLElement, value: string): void {
    const node = document.createTextNode(""); parent.append(node);
    const chars = Array.from(value);
    runs.push({ node, chars, start: length, shown: -1 }); length += chars.length;
  }
  function element(parent: HTMLElement, tag: string, build: (node: HTMLElement) => void): HTMLElement {
    const node = document.createElement(tag); parent.append(node);
    const start = length; build(node); groups.push({ node, start, end: length });
    return node;
  }
  function inline(parent: HTMLElement, parts: MarkdownInline[]): void {
    for (const part of parts) {
      if (part.type === "text") text(parent, part.text);
      else if (part.type === "code") {
        element(parent, "span", (span) => {
          element(span, "code", (node) => text(node, part.text));
          const ref = fileReference(part.text), open = cwd && ref && !parent.closest("a") ? fileOpen(cwd, ref) : undefined;
          if (open) { span.append(open); groups.push({ node: open, start: length - 1, end: length }); }
        });
      }
      else if (part.type === "link") {
        element(parent, "a", (node) => {
          const link = node as HTMLAnchorElement;
          link.href = part.href; link.target = "_blank"; link.rel = "noopener noreferrer";
          inline(link, part.children);
        });
      } else element(parent, part.type, (node) => inline(node, part.children));
    }
  }
  function tableRow(parent: HTMLElement, cells: MarkdownInline[][], align: ("left" | "center" | "right")[], header = false): void {
    element(parent, "tr", (row) => {
      cells.forEach((cell, column) => {
        // Empty cells still occupy their column when a row becomes visible.
        const node = document.createElement(header ? "th" : "td");
        node.style.textAlign = align[column];
        if (header) node.setAttribute("scope", "col");
        row.append(node); inline(node, cell);
      });
    });
  }
  function render(parent: HTMLElement, content: MarkdownBlock[]): void {
    for (const block of content) {
      if (block.type === "paragraph" || block.type === "heading") {
        element(parent, block.type === "paragraph" ? "p" : `h${block.level}`, (node) => inline(node, block.children));
      } else if (block.type === "code") {
        element(parent, "pre", (node) => {
          const code = document.createElement("code"); node.append(code); text(code, block.text);
        });
      } else if (block.type === "blank") {
        element(parent, "div", (node) => { node.className = "markdown-blank"; node.setAttribute("aria-hidden", "true"); });
      } else if (block.type === "rule") element(parent, "hr", () => {});
      else if (block.type === "quote") element(parent, "blockquote", (node) => render(node, block.blocks));
      else if (block.type === "list") {
        element(parent, block.ordered ? "ol" : "ul", (list) => {
          if (block.ordered) (list as HTMLOListElement).start = block.start;
          for (const item of block.items) {
            element(list, "li", (node) => {
              if (item.checked !== undefined) {
                node.className = "markdown-task";
                const check = document.createElement("input"); check.type = "checkbox"; check.disabled = true; check.checked = item.checked;
                // The adjacent item content is its accessible label; this is not an interactive control.
                check.setAttribute("aria-hidden", "true"); check.tabIndex = -1; node.append(check);
              }
              render(node, item.blocks);
            });
          }
        });
      } else if (block.type === "table") {
        element(parent, "div", (scroll) => {
          scroll.className = "markdown-table-scroll"; scroll.tabIndex = 0;
          const table = document.createElement("table"), head = document.createElement("thead"), body = document.createElement("tbody");
          scroll.append(table); table.append(head, body);
          tableRow(head, block.header, block.align, true);
          for (const row of block.rows) tableRow(body, row, block.align);
        });
      }
    }
  }
  render(root, blocks);
  function show(count: number): void {
    const full = count === Infinity || count > 0 && count >= length;
    for (const run of runs) {
      const visible = Math.max(0, Math.min(count - run.start, run.chars.length));
      if (visible !== run.shown) { run.node.data = run.chars.slice(0, visible).join(""); run.shown = visible; }
    }
    for (const group of groups) group.node.hidden = !(count > group.start || full && group.start === group.end);
  }
  show(shown);
  return { length, show };
}
