export const NOTICE_ARROW_HEIGHT = 18;

// Four clear map pixels, ±2px bob, above the visible head or its report sign.
export function noticeArrowTop(head: number, bob: number, sign = head): number {
  return Math.max(0, Math.round(Math.min(head, sign) - NOTICE_ARROW_HEIGHT - 4 + bob));
}

// Milliseconds since arriving from a notice; offsets are in map pixels.
export function noticeMarkMotion(elapsed: number): { jump: number; bob: number } | undefined {
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= 3000) return;
  return {
    jump: elapsed < 500 ? Math.round(4 * Math.sin(Math.PI * (elapsed % 250) / 250)) : 0,
    bob: Math.round(2 * Math.sin(2 * Math.PI * (elapsed % 500) / 500)) || 0,
  };
}
