import { tr } from "../language";
import type { Notice } from "../town/herald";
import { PROJECTS } from "./mock-data";

const ORDER: Notice["kind"][] = ["permission", "call", "new", "struggle", "report"];
// Heroes point at mock-data names, so a notice can show the same target mark as the app.
const HEROES: Partial<Record<Notice["kind"], string>> = { call: "t11-callme", report: "t5-hooks" };
export function notices(): Notice[] {
  const list: Notice[] = [
    { kind: "permission", repo: "agent-character", hero: "t7-server", text: tr("t7-server が「git push」の きょかを まっている", "t7-server asks permission: git push"), ago: tr("1分前", "1 min ago") },
    { kind: "struggle", repo: "agent-character", hero: "t1-core", text: tr("t1-core が くるしい たたかい（5分で しっぱい3回）", "t1-core: tough battle (3 failures in 5 min)"), ago: tr("3分前", "3 min ago") },
  ];
  for (const p of PROJECTS) {
    const hero = p.repo === "agent-character" ? HEROES : {};
    if (!p.theme) list.push({ kind: "new", repo: p.repo, text: tr(`あたらしい町「${p.repo}」が できた！ すがたを えらぼう`, "New town! Choose its look"), ago: tr("いま", "just now") });
    if (p.calling) list.push({ kind: "call", repo: p.repo, hero: hero.call, text: tr(`${p.repo} の ゆうしゃが あなたを よんでいる`, "A hero is calling you"), ago: tr("2分前", "2 min ago") });
    if (p.unread) list.push({ kind: "report", repo: p.repo, hero: hero.report, text: tr(`${p.repo} から ほうこくが ${p.unread}件`, `Reports arrived: ${p.unread}`), ago: tr("5分前", "5 min ago") });
  }
  return list.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}
