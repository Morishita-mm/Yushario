import type { Notice } from "../town/herald";
import { PROJECTS } from "./mock-data";

const ORDER: Notice["kind"][] = ["permission", "call", "new", "struggle", "report"];
export function notices(): Notice[] {
  const list: Notice[] = [
    { kind: "permission", repo: "shop-api", text: "t3-checkout が「npm publish」の きょかを まっている", ago: "1分前" },
    { kind: "struggle", repo: "data-pipeline", text: "t8-etl が くるしい たたかい（5分で しっぱい3回）", ago: "3分前" },
  ];
  for (const p of PROJECTS) {
    if (!p.theme) list.push({ kind: "new", repo: p.repo, text: `あたらしい町「${p.repo}」が できた！ すがたを えらぼう`, ago: "いま" });
    if (p.calling) list.push({ kind: "call", repo: p.repo, text: `${p.repo} の ゆうしゃが あなたを よんでいる`, ago: "2分前" });
    if (p.unread) list.push({ kind: "report", repo: p.repo, text: `${p.repo} から ほうこくが ${p.unread}件`, ago: "5分前" });
  }
  return list.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}
