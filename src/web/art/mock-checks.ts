import type { QuestCheck } from "../../core/checks";
import { checkMarks } from "../town/check-marks";
import { tr } from "../language";

export const mockFingerprint = { head: "abc123def456", changes: "current" };
export function mockChecks(id: string): QuestCheck[] {
  return [
    { id: `${id}-type`, name: tr("型チェック", "Typecheck"), command: "npm run typecheck", evidence: {
      at: Date.now() - 60000, command: "npm run typecheck", passed: true, session: "mock-terminal", hero: "Hero", checks: [`${id}-type`], fingerprint: mockFingerprint } },
    { id: `${id}-test`, name: tr("テスト", "Tests"), command: "npm test", evidence: {
      at: Date.now() - 30000, command: "npm test", passed: false, session: "mock-terminal", hero: "Hero", checks: [`${id}-test`], fingerprint: mockFingerprint } },
    { id: `${id}-lint`, name: "lint", command: "npm run lint", evidence: {
      at: Date.now() - 120000, command: "npm run lint", passed: true, session: "mock-terminal", hero: "Hero", checks: [`${id}-lint`], fingerprint: { ...mockFingerprint, changes: "old" } } },
    { id: `${id}-build`, name: tr("ビルド", "Build"), command: "npm run build" },
  ];
}
export function mockReportChecks(root: HTMLElement): void {
  root.querySelector(".report-window h3")?.after(checkMarks(mockChecks("mock-report"), mockFingerprint));
}
