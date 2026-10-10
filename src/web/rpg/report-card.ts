import type { RoomAgent, TalkReport } from "../../core/room";
import { renderTalk, talkParts, talkPreview } from "./talk-text";

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
  return seconds >= 60 ? `${Math.floor(seconds / 60)}分 ${seconds % 60}秒` : `${seconds}秒`;
}

function reportHeadline(entry: Reply): string {
  const report = entry.report;
  if (!report) return "へんじが とどいた";
  if (report.kind === "chest") return `しょうり！ ファイル ${report.files.length}つを なおした`;
  return report.kind === "scroll" ? "しらべて もどってきた" : "はなしかけてきた";
}

export function createReportCard(entry: Reply, name: string, art: Sheets) {
  const row = node("article", `report-card ${entry.report?.kind ?? "talk"}`);
  row.dataset.reportAt = String(entry.at);
  const head = node("div", "report-card-heading");
  const icon = node("span", "report-icon");
  const [w, h] = art.size("ui-report");
  icon.style.width = `${w}px`; icon.style.height = `${h}px`;
  icon.style.backgroundPositionX = `${-w * art.index("ui-report", REPORT_FRAME[entry.report?.kind ?? "talk"])}px`;
  icon.setAttribute("aria-label", { chest: "宝箱", scroll: "巻物", talk: "吹き出し" }[entry.report?.kind ?? "talk"]);
  const time = new Date(entry.at).toLocaleTimeString("ja-JP", { hour12: false });
  const caption = node("div", "report-caption");
  caption.append(node("h4", "report-headline", reportHeadline(entry)),
    node("p", "report-time", `${name} · ${time}${entry.report ? ` · ${duration(entry.report.endedAt - entry.report.startedAt - (entry.report.waitedMs ?? 0))}${entry.report.waitedMs ? `（きょか まち ${duration(entry.report.waitedMs)} を のぞく）` : ""}` : " · 集計なし"}`));
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
    const mp = report.mp && start !== end ? ` · MP ${start} → ${end}（${start >= end ? "−" : "+"}${Math.abs(start - end)}）` : "";
    // Only what actually happened: a plain conversation shows no tally line at all.
    const facts = [
      report.tests.passed + report.tests.failed ? `テスト ○${report.tests.passed} ×${report.tests.failed}` : "",
      report.failures ? `しっぱい ${report.failures}` : "",
      report.tools ? `ツール ${report.tools}` : "",
    ].filter(Boolean).join(" · ");
    if (facts || mp) tally.append(node("p", "", `${facts}${facts ? mp : mp.replace(/^ · /, "")}`));
    if (tally.childElementCount) row.append(tally);
  }
  const body = node("div", "talk-body");
  const more = document.createElement("button");
  more.type = "button"; more.className = "report-more";
  more.setAttribute("aria-expanded", "false");
  row.append(body, more);
  const parts = talkParts(entry.text), preview = talkPreview(parts);
  let view: ReturnType<typeof renderTalk> | undefined, isExpanded: boolean | undefined;
  function show(shown: number): void {
    if (!view) return;
    view.show(shown);
    more.hidden = !preview.more || shown < view.length;
  }
  function renderBody(expanded: boolean, shown = Infinity): number {
    if (!view || expanded !== isExpanded) {
      view = renderTalk(body, expanded ? parts : preview.parts, shown);
      isExpanded = expanded;
      more.textContent = expanded ? "▲ たたむ" : "▼ つづき";
      more.setAttribute("aria-expanded", String(expanded));
    }
    show(shown);
    return view.length;
  }
  return { row, more, renderBody, show };
}
