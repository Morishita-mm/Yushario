import type { QuestCheck } from "../../core/checks";

export const mockFingerprint = { head: "abc123def456", changes: "current", base: "/mock/project" };
export function mockChecks(id: string): QuestCheck[] {
  return [
    { id: `${id}-type`, name: "型チェック", command: "npm run typecheck", evidence: {
      at: Date.now() - 60000, command: "npm run typecheck", passed: true, session: "mock-terminal", base: mockFingerprint.base, hero: "Hero", checks: [`${id}-type`], fingerprint: mockFingerprint } },
    { id: `${id}-test`, name: "テスト", command: "npm test", evidence: {
      at: Date.now() - 30000, command: "npm test", passed: false, session: "mock-terminal", base: mockFingerprint.base, hero: "Hero", checks: [`${id}-test`], fingerprint: mockFingerprint } },
    { id: `${id}-lint`, name: "lint", command: "npm run lint", evidence: {
      at: Date.now() - 120000, command: "npm run lint", passed: true, session: "mock-terminal", base: mockFingerprint.base, hero: "Hero", checks: [`${id}-lint`], fingerprint: { ...mockFingerprint, changes: "old" } } },
    { id: `${id}-build`, name: "ビルド", command: "npm run build" },
    { id: `${id}-unknown`, name: "複合テスト", command: "npm test", evidence: {
      at: Date.now() - 10000, command: "npm test || true", session: "mock-terminal", base: mockFingerprint.base,
      hero: "Hero", checks: [`${id}-unknown`], fingerprint: mockFingerprint } },
  ];
}
