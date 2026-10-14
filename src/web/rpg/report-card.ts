import { clock, tr } from "../language";
import type { RoomAgent, TalkReport } from "../../core/room";
import { parseMarkdown } from "../../core/markdown";
import { markdownPreview } from "../../core/markdown-preview";
import { renderMarkdown } from "./markdown";

import type { Sheets } from "../town/sheets";

export const REPORT_FRAME: Record<TalkReport["kind"], string> = {
  chest: "treasure chest open glowing", scroll: "rolled parchment scroll", talk: "speech bubble with lines",
};
type Reply = RoomAgent["talk"][number];

function node(tag: string, className: string, text?: string): HTMLElement {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function duration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return seconds >= 60 ? tr(`${Math.floor(seconds / 60)}分 ${seconds % 60}秒`, `${Math.floor(seconds / 60)}m ${seconds % 60}s`) : tr(`${seconds}秒`, `${seconds}s`);
}

function reportHeadline(entry: Reply): string {
  const report = entry.report;
  if (!report) return tr("へんじが とどいた", "A reply arrived");
  if (report.stopFailure) return tr("とちゅうで たおれた…", "Went down partway…");
  if (report.tests.last === "failed") return tr(`ファイル ${report.files.length}つを かえた。テストは しっぱい`, `Changed ${report.files.length} files. Tests failed`);
  if (report.kind === "chest") return tr(`しょうり！ ファイル ${report.files.length}つを なおした`, `Victory! Files fixed: ${report.files.length}`);
  return report.kind === "scroll" ? tr("しらべて もどってきた", "Returned from exploring") : tr("はなしかけてきた", "Came to talk");
}

export function createReportCard(entry: Reply, name: string, art: Sheets) {
  const row = node("article", `report-card ${entry.report?.kind ?? "talk"}`);
  row.dataset.reportAt = String(entry.at);
  const head = node("div", "report-card-heading");
  const icon = node("span", "report-icon");
  const [w, h] = art.size("ui-report");
  icon.style.width = `${w}px`; icon.style.height = `${h}px`;
  icon.style.backgroundPositionX = `${-w * art.index("ui-report", REPORT_FRAME[entry.report?.kind ?? "talk"])}px`;
  icon.setAttribute("aria-label", { chest: tr("宝箱", "Chest"), scroll: tr("巻物", "Scroll"), talk: tr("吹き出し", "Speech") }[entry.report?.kind ?? "talk"]);
  const time = clock(entry.at, true);
  const caption = node("div", "report-caption");
  caption.append(node("h4", "report-headline", reportHeadline(entry)),
    node("p", "report-time", `${name} · ${time}${entry.report ? ` · ${duration(entry.report.endedAt - entry.report.startedAt - (entry.report.waitedMs ?? 0))}${entry.report.waitedMs ? tr(`（きょか まち ${duration(entry.report.waitedMs)} を のぞく）`, ` (excludes ${duration(entry.report.waitedMs)} permission wait)`) : ""}` : tr(" · 集計なし", " · No tally")}`));
  head.append(icon, caption); row.append(head);
  const report = entry.report;
  if (report) {
    const tally = node("div", "report-tally");
    if (report.files.length) {
      const files = node("ul", "report-files");
      for (const file of report.files) files.append(node("li", "", file));
      tally.append(files);
    }
    const start = report.mp ? Math.round(report.mp.start * 100) : 0, end = report.mp ? Math.round(report.mp.end * 100) : 0;
    const mp = report.mp && start !== end ? tr(` · MP ${start} → ${end}（${start >= end ? "−" : "+"}${Math.abs(start - end)}）`, ` · MP ${start} → ${end} (${start >= end ? "−" : "+"}${Math.abs(start - end)})`) : "";
    // Only what actually happened: a plain conversation shows no tally line at all.
    const facts = [
      report.tests.passed + report.tests.failed ? tr(`テストの じっこう ○${report.tests.passed} ×${report.tests.failed}`, `Test runs ○${report.tests.passed} ×${report.tests.failed}`) : "",
      report.failures ? tr(`しっぱい ${report.failures}`, `Failures ${report.failures}`) : "",
      report.tools ? tr(`ツール ${report.tools}`, `Tools ${report.tools}`) : "",
    ].filter(Boolean).join(" · ");
    if (facts || mp) tally.append(node("p", "", `${facts}${facts ? mp : mp.replace(/^ · /, "")}`));
    if (tally.childElementCount) row.append(tally);
  }
  const body = node("div", "talk-body");
  const more = document.createElement("button");
  more.type = "button"; more.className = "report-more";
  more.setAttribute("aria-expanded", "false");
  row.append(body, more);
  const blocks = parseMarkdown(entry.text), preview = markdownPreview(blocks);
  let view: ReturnType<typeof renderMarkdown> | undefined, isExpanded: boolean | undefined;
  function show(shown: number): void {
    if (!view) return;
    view.show(shown);
    more.hidden = !preview.more || shown < view.length;
  }
  function renderBody(expanded: boolean, shown = Infinity): number {
    if (!view || expanded !== isExpanded) {
      view = renderMarkdown(body, expanded ? blocks : preview.blocks, shown);
      isExpanded = expanded;
      more.textContent = expanded ? tr("▲ たたむ", "▲ Less") : tr("▼ つづき", "▼ More");
      more.setAttribute("aria-expanded", String(expanded));
    }
    show(shown);
    return view.length;
  }
  return { row, more, renderBody, show };
}
