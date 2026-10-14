export type MarkdownInline =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "strong" | "em" | "del"; children: MarkdownInline[] }
  | { type: "link"; href: string; children: MarkdownInline[] };

// No HTML or arbitrary schemes: the web renderer receives only text and HTTP(S) links.
function safeLink(href: string): boolean {
  return /^https?:\/\/[^\s<>]+$/i.test(href) && !/[\u0000-\u001f\u007f]/.test(href);
}
const word = (char: string) => /[\p{L}\p{N}_]/u.test(char);

function linkAt(text: string): { raw: string; label: string; href: string } | undefined {
  const start = text.startsWith("![") ? 2 : text.startsWith("[") ? 1 : 0;
  if (!start) return;
  const labelEnd = text.indexOf("](", start);
  if (labelEnd < 0) return;
  let depth = 1, end = labelEnd + 2;
  for (; end < text.length; end++) {
    if (text[end] === "\\") { end++; continue; }
    if (text[end] === "(") depth++;
    if (text[end] === ")" && --depth === 0) break;
    if (text[end] === "\n") return;
  }
  if (depth) return;
  return { raw: text.slice(0, end + 1), label: text.slice(start, labelEnd), href: text.slice(labelEnd + 2, end) };
}

function closingMarker(text: string, start: number, marker: string): number {
  for (let end = start; end < text.length; end++) {
    if (text[end] === "\\") { end++; continue; }
    const rest = text.slice(end);
    const tag = text[end] === "<" ? /^<[^>\n]*>/.exec(rest)?.[0] : undefined;
    const link = linkAt(rest);
    if (tag || link) { end += (tag ?? link!.raw).length - 1; continue; }
    if (text[end] === "`") {
      const ticks = /^`+/.exec(rest)![0], close = text.indexOf(ticks, end + ticks.length);
      if (close >= 0) { end = close + ticks.length - 1; continue; }
    }
    if (!text.startsWith(marker, end)) continue;
    if (marker.length === 2 && marker !== "~~") while (text[end + marker.length] === marker[0]) end++;
    if (!/\s/.test(text[end - 1]) &&
      !(marker[0] === "_" && word(text[end - 1]) && word(text[end + marker.length] ?? ""))) return end;
    end += marker.length - 1;
  }
  return -1;
}

export function parseMarkdownInline(text: string, depth = 0): MarkdownInline[] {
  if (depth >= 32) return [{ type: "text", text }];
  const result: MarkdownInline[] = [];
  function plain(value: string): void {
    const last = result[result.length - 1];
    if (last?.type === "text") last.text += value;
    else if (value) result.push({ type: "text", text: value });
  }
  for (let i = 0; i < text.length;) {
    const rest = text.slice(i), char = text[i];
    if (char === "\\" && /[\\`*_[\]{}()#+.!>|~-]/.test(text[i + 1] ?? "")) {
      plain(text[i + 1]); i += 2; continue;
    }
    // Tags are literal, including attributes; URLs inside a tag are not linkified.
    if (char === "<" && /^<[^>\n]*>/.test(rest)) {
      const tag = /^<[^>\n]*>/.exec(rest)![0]; plain(tag); i += tag.length; continue;
    }
    if (char === "`") {
      const marker = /^`+/.exec(rest)![0], end = text.indexOf(marker, i + marker.length);
      if (end >= 0) {
        result.push({ type: "code", text: text.slice(i + marker.length, end) }); i = end + marker.length; continue;
      }
      plain(marker); i += marker.length; continue;
    }
    const link = linkAt(rest);
    if (link) {
      if (safeLink(link.href)) result.push({ type: "link", href: link.href, children: parseMarkdownInline(link.label, depth + 1) });
      else plain(link.raw);
      i += link.raw.length; continue;
    }
    const url = /^https?:\/\/[^\s<>]+/i.exec(rest)?.[0];
    if (url) {
      let href = url.replace(/[.,!?;:]+$/, "");
      while (href.endsWith(")") && href.split(")").length > href.split("(").length) href = href.slice(0, -1);
      if (safeLink(href)) {
        result.push({ type: "link", href, children: [{ type: "text", text: href }] }); i += href.length; continue;
      }
    }
    const marker = /^(\*{1,3}|_{1,3}|~~)/.exec(rest)?.[0];
    if (marker && !(/^[*_]/.test(marker) && text[i + marker.length] === char)) {
      const insideWord = char === "_" && word(text[i - 1] ?? "") && word(text[i + marker.length] ?? "");
      const end = closingMarker(text, i + marker.length, marker);
      if (!insideWord && end > i + marker.length && !/\s/.test(text[i + marker.length])) {
        const children = parseMarkdownInline(text.slice(i + marker.length, end), depth + 1);
        const type = marker === "~~" ? "del" : marker.length > 1 ? "strong" : "em";
        result.push({ type, children: marker.length === 3 ? [{ type: "em", children }] : children });
        i = end + marker.length; continue;
      }
      plain(marker); i += marker.length; continue;
    }
    plain(char); i++;
  }
  return result;
}

export function markdownInlineText(inlines: MarkdownInline[]): string {
  return inlines.map((part) => "text" in part ? part.text : markdownInlineText(part.children)).join("");
}
