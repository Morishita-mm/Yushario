import { parseMarkdownInline, type MarkdownInline } from "./markdown-inline";

export type MarkdownBlock =
  | { type: "paragraph" | "heading"; children: MarkdownInline[]; level?: number }
  | { type: "blank" | "rule" }
  | { type: "code"; text: string }
  | { type: "quote"; blocks: MarkdownBlock[] }
  | { type: "list"; ordered: boolean; start: number; items: { checked?: boolean; blocks: MarkdownBlock[] }[] }
  | { type: "table"; align: ("left" | "center" | "right")[]; header: MarkdownInline[][]; rows: MarkdownInline[][][] };

function cells(line: string): string[] {
  let source = line.trim();
  if (source.startsWith("|")) source = source.slice(1);
  if (source.endsWith("|") && !source.endsWith("\\|")) source = source.slice(0, -1);
  const result: string[] = [];
  let value = "";
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\\" && source[i + 1] === "|") { value += "|"; i++; }
    else if (source[i] === "|") { result.push(value.trim()); value = ""; }
    else value += source[i];
  }
  result.push(value.trim());
  return result;
}
function tableHeader(lines: string[], at: number) {
  if (!lines[at]?.includes("|") || !lines[at + 1]) return;
  const header = cells(lines[at]), separators = cells(lines[at + 1]);
  if (header.length !== separators.length || !separators.every((cell) => /^:?-{3,}:?$/.test(cell))) return;
  const align = separators.map((cell): "left" | "center" | "right" => cell.endsWith(":") ? cell.startsWith(":") ? "center" : "right" : "left");
  return { header: header.map(parseCell), align };
}
const parseCell = (text: string) => parseMarkdownInline(text);
const listLine = (line: string) => /^( *)([-*+]|\d+\.)[ \t]+(.*)$/.exec(line);
const fenceLine = (line: string) => /^ {0,3}```[^`]*$/.test(line);
const headingLine = (line: string) => /^ {0,3}(#{1,6})(?:[ \t]+(.*)|$)/.exec(line);
const ruleLine = (line: string) => /^ {0,3}(?:-\s*){3,}$/.test(line);
const quoteLine = (line: string) => /^ {0,3}> ?/.test(line);

// The supported subset is deliberately local: no HTML, extensions, or library hooks.
export function parseMarkdown(text: string, depth = 0): MarkdownBlock[] {
  if (depth >= 32) return [{ type: "paragraph", children: [{ type: "text", text }] }];
  const lines = text.replace(/\r\n?/g, "\n").replace(/^\t+/gm, (tabs) => "    ".repeat(tabs.length)).split("\n");
  const blocks: MarkdownBlock[] = [];
  function startsBlock(at: number): boolean {
    const line = lines[at];
    return !line.trim() || fenceLine(line) || Boolean(headingLine(line)) || ruleLine(line) ||
      quoteLine(line) || Boolean(listLine(line)) || Boolean(tableHeader(lines, at));
  }
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim()) { if (i < lines.length - 1) blocks.push({ type: "blank" }); i++; continue; }
    if (fenceLine(line)) {
      let end = i + 1;
      while (end < lines.length && !/^ {0,3}```\s*$/.test(lines[end])) end++;
      if (end < lines.length) {
        blocks.push({ type: "code", text: lines.slice(i + 1, end).join("\n") + (end > i + 1 ? "\n" : "") });
        i = end + 1; continue;
      }
      // An unclosed fence is ordinary text, not an unfinished formatting instruction.
      blocks.push({ type: "paragraph", children: [{ type: "text", text: lines.slice(i).join("\n") }] }); break;
    }
    const heading = headingLine(line);
    if (heading) { blocks.push({ type: "heading", level: heading[1].length, children: parseCell((heading[2] ?? "").replace(/[ \t]+#+[ \t]*$/, "")) }); i++; continue; }
    if (ruleLine(line)) { blocks.push({ type: "rule" }); i++; continue; }
    const table = tableHeader(lines, i);
    if (table) {
      i += 2;
      const rows: MarkdownInline[][][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        const row = cells(lines[i++]);
        rows.push(table.header.map((_, column) => parseCell(row[column] ?? "")));
      }
      blocks.push({ type: "table", ...table, rows }); continue;
    }
    if (quoteLine(line)) {
      const quoted: string[] = [];
      while (i < lines.length && quoteLine(lines[i])) quoted.push(lines[i++].replace(/^ {0,3}> ?/, ""));
      blocks.push({ type: "quote", blocks: parseMarkdown(quoted.join("\n"), depth + 1) }); continue;
    }
    const first = listLine(line);
    if (first) {
      const indent = first[1].length, ordered = /\d/.test(first[2]);
      const items: { checked?: boolean; blocks: MarkdownBlock[] }[] = [];
      while (i < lines.length) {
        const next = !lines[i].trim() ? listLine(lines[i + 1] ?? "") : undefined;
        if (next && next[1].length === indent && /\d/.test(next[2]) === ordered) i++;
        const item = listLine(lines[i]);
        if (!item || item[1].length !== indent || /\d/.test(item[2]) !== ordered) break;
        const contentIndent = item[1].length + item[2].length + 1;
        let content = item[3];
        const check = /^\[([ xX])\]\s+/.exec(content);
        if (check) content = content.slice(check[0].length);
        const body = [content]; i++;
        while (i < lines.length) {
          if (!lines[i].trim()) {
            if (!lines[i + 1] || lines[i + 1].match(/^ */)![0].length <= indent) break;
            body.push(""); i++; continue;
          }
          const spaces = lines[i].match(/^ */)![0].length;
          if (spaces <= indent) break;
          body.push(lines[i++].slice(Math.min(spaces, contentIndent)));
        }
        items.push({ ...(check ? { checked: check[1].toLowerCase() === "x" } : {}), blocks: parseMarkdown(body.join("\n"), depth + 1) });
      }
      blocks.push({ type: "list", ordered, start: ordered ? Number.parseInt(first[2]) : 1, items }); continue;
    }
    const paragraph = [line]; i++;
    while (i < lines.length && !startsBlock(i)) paragraph.push(lines[i++]);
    blocks.push({ type: "paragraph", children: parseCell(paragraph.join("\n")) });
  }
  return blocks;
}
