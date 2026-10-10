type Part = { code: boolean; text: string };

// Only fenced code is formatted; all content is inserted as text, never HTML.
export function talkParts(text: string): Part[] {
  const parts: Part[] = [];
  const fence = /```(?:[^\n`]*\n)?([\s\S]*?)(?:```|$)/g;
  let start = 0;
  for (const match of text.matchAll(fence)) {
    if (match.index > start) parts.push({ code: false, text: text.slice(start, match.index) });
    parts.push({ code: true, text: match[1] });
    start = match.index + match[0].length;
  }
  if (start < text.length) parts.push({ code: false, text: text.slice(start) });
  return parts;
}

// Keep code styling across page boundaries, with a small RPG-sized page of text.
export function talkPages(text: string): Part[][] {
  const pages: Part[][] = [[]];
  let count = 0, lines = 0;
  for (const part of talkParts(text)) {
    for (const char of Array.from(part.text)) {
      if (count >= 420 || lines >= 8) { pages.push([]); count = lines = 0; }
      const page = pages[pages.length - 1];
      let run = page[page.length - 1];
      if (!run || run.code !== part.code) { run = { code: part.code, text: "" }; page.push(run); }
      run.text += char;
      count++;
      if (char === "\n") lines++;
    }
  }
  return pages;
}

export function pageLength(page: Part[]): number {
  return page.reduce((sum, part) => sum + Array.from(part.text).length, 0);
}

export function renderTalk(root: HTMLElement, parts: Part[], shown = Infinity): void {
  root.replaceChildren();
  for (const part of parts) {
    const chars = Array.from(part.text);
    const node = document.createElement(part.code ? "pre" : "span");
    node.textContent = chars.slice(0, shown).join("");
    root.append(node);
    shown -= Math.min(shown, chars.length);
    if (shown <= 0) break;
  }
}
