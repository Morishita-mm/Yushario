import type { MarkdownBlock } from "./markdown";
import { markdownInlineText, type MarkdownInline } from "./markdown-inline";

const count = (text: string) => Array.from(text).length;
const inlineSize = (parts: MarkdownInline[]) => count(markdownInlineText(parts));
const rowSize = (row: MarkdownInline[][]) => row.reduce((sum, cell) => sum + inlineSize(cell), 0);

export function markdownSize(blocks: MarkdownBlock[]): { chars: number; lines: number } {
  let chars = 0, lines = 0;
  for (const block of blocks) {
    if (block.type === "paragraph" || block.type === "heading") {
      const text = markdownInlineText(block.children); chars += count(text); lines += text.split("\n").length;
    } else if (block.type === "code") {
      chars += count(block.text); lines += block.text.replace(/\n$/, "").split("\n").length;
    } else if (block.type === "table") {
      chars += rowSize(block.header) + block.rows.reduce((sum, row) => sum + rowSize(row), 0); lines += 1 + block.rows.length;
    } else if (block.type === "list" || block.type === "quote") {
      const nested = markdownSize(block.type === "quote" ? block.blocks : block.items.flatMap((item) => item.blocks));
      chars += nested.chars; lines += nested.lines;
    } else lines++;
  }
  return { chars, lines };
}

// Keep complete blocks. Only tables and fences may end at an internal row/line boundary.
// A first oversized ordinary block remains whole, so even a single long paragraph is readable.
export function markdownPreview(blocks: MarkdownBlock[], maxChars = 420, maxLines = 8): { blocks: MarkdownBlock[]; more: boolean } {
  const preview: MarkdownBlock[] = [];
  let chars = 0, lines = 0;
  function fits(size: { chars: number; lines: number }): boolean {
    return chars + size.chars <= maxChars && lines + size.lines <= maxLines;
  }
  for (const block of blocks) {
    const size = markdownSize([block]);
    if (fits(size)) { preview.push(block); chars += size.chars; lines += size.lines; continue; }
    if (block.type === "table") {
      const headerSize = { chars: rowSize(block.header), lines: 1 };
      if (!fits(headerSize) && preview.length) break;
      const rows: MarkdownInline[][][] = [];
      chars += headerSize.chars; lines++;
      for (const row of block.rows) {
        const rowChars = rowSize(row);
        if (chars + rowChars > maxChars || lines >= maxLines) break;
        rows.push(row); chars += rowChars; lines++;
      }
      preview.push({ ...block, rows });
      if (rows.length !== block.rows.length) return { blocks: preview, more: true };
      continue;
    }
    if (block.type === "code") {
      const codeLines = block.text.match(/[^\n]*\n|[^\n]+$/g) ?? [""];
      let text = "", included = 0;
      for (const line of codeLines) {
        if ((chars + count(line) > maxChars || lines >= maxLines) && (preview.length || included)) break;
        text += line; chars += count(line); lines++; included++;
      }
      if (included) preview.push({ ...block, text });
      if (included !== codeLines.length) return { blocks: preview, more: true };
      continue;
    }
    if (!preview.length) { preview.push(block); chars += size.chars; lines += size.lines; continue; }
    break;
  }
  return { blocks: preview, more: preview.length < blocks.length };
}
