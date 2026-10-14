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

export function renderTalk(root: HTMLElement, parts: Part[], shown = Infinity) {
  root.replaceChildren();
  const runs = parts.map((part) => {
    const node = document.createElement(part.code ? "pre" : "span");
    const text = document.createTextNode(""); node.append(text); root.append(node);
    return { node, text, chars: Array.from(part.text), shown: -1 };
  });
  function show(remaining: number): void {
    runs.forEach((run, index) => {
      run.node.hidden = index > 0 && remaining <= 0;
      const count = Math.min(remaining, run.chars.length);
      if (count !== run.shown) {
        run.text.data = run.chars.slice(0, count).join(""); run.shown = count;
      }
      remaining -= count;
    });
  }
  show(shown);
  return { length: runs.reduce((sum, run) => sum + run.chars.length, 0), show };
}
