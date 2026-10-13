import type { Notice } from "../town/herald";
import { PROJECTS } from "./mock-data";

const ORDER: Notice["kind"][] = ["permission", "call", "new", "struggle", "report"];
// Heroes point at mock-data names, so a notice can show the same target mark as the app.
const HEROES: Partial<Record<Notice["kind"], string>> = { call: "t11-callme", report: "t5-hooks" };
export function notices(): Notice[] {
  const list: Notice[] = [
    { kind: "permission", repo: "agent-character", hero: "t7-server", text: "t7-server が「git push」の きょかを まっている", ago: "1分前" },
    { kind: "struggle", repo: "agent-character", hero: "t1-core", text: "t1-core が くるしい たたかい（5分で しっぱい3回）", ago: "3分前" },
  ];
  for (const p of PROJECTS) {
    const hero = p.repo === "agent-character" ? HEROES : {};
    if (!p.theme) list.push({ kind: "new", repo: p.repo, text: `あたらしい町「${p.repo}」が できた！ すがたを えらぼう`, ago: "いま" });
    if (p.calling) list.push({ kind: "call", repo: p.repo, hero: hero.call, text: `${p.repo} の ゆうしゃが あなたを よんでいる`, ago: "2分前" });
    if (p.unread) list.push({ kind: "report", repo: p.repo, hero: hero.report, text: `${p.repo} から ほうこくが ${p.unread}件`, ago: "5分前" });
  }
  return list.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}
