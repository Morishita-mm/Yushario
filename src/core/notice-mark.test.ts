import { describe, expect, it } from "vitest";
import { NOTICE_ARROW_HEIGHT, noticeArrowTop, noticeMarkMotion } from "./notice-mark";

describe("noticeArrowTop", () => {
  it("keeps two to six clear pixels above the visible head throughout the bob", () => {
    for (let t = 0; t < 3000; t++) {
      const { jump, bob } = noticeMarkMotion(t)!;
      const head = 90 - jump;
      const gap = head - (noticeArrowTop(head, bob) + NOTICE_ARROW_HEIGHT);
      expect(gap).toBeGreaterThanOrEqual(2);
      expect(gap).toBeLessThanOrEqual(6);
    }
  });

  it("uses the report sign top if it is higher than the head", () => {
    for (const bob of [-2, 0, 2]) {
      expect(60 - noticeArrowTop(90, bob, 60) - NOTICE_ARROW_HEIGHT).toBe(4 - bob);
      expect(noticeArrowTop(90, bob, 120)).toBe(noticeArrowTop(90, bob));
    }
  });

  it("lowers the entire arrow into the screen even if that overlaps the hero", () => {
    expect(noticeArrowTop(12, -2)).toBe(0);
    expect(noticeArrowTop(50, 2, -4)).toBe(0);
    expect(noticeArrowTop(24, 0)).toBe(2);
  });
});

describe("noticeMarkMotion", () => {
  it("is visible immediately and ends at three seconds", () => {
    expect(noticeMarkMotion(0)).toEqual({ jump: 0, bob: 0 });
    expect(noticeMarkMotion(2999)).toBeDefined();
    for (const elapsed of [-1, 3000, 5000, NaN, Infinity]) expect(noticeMarkMotion(elapsed)).toBeUndefined();
  });

  it("jumps twice, four pixels high, with a 250ms landing interval", () => {
    expect([0, 125, 250, 375, 500, 625, 2999].map((t) => noticeMarkMotion(t)?.jump))
      .toEqual([0, 4, 0, 4, 0, 0, 0]);
    for (let t = 0; t < 3000; t++) {
      const jump = noticeMarkMotion(t)!.jump;
      expect(Number.isInteger(jump)).toBe(true);
      expect(jump).toBeGreaterThanOrEqual(0);
      expect(jump).toBeLessThanOrEqual(4);
      if (t >= 500) expect(jump).toBe(0);
    }
  });

  it("bobs by two pixels on a half-second cycle after the jumps finish", () => {
    expect([500, 625, 750, 875, 1000].map((t) => noticeMarkMotion(t)!.bob || 0))
      .toEqual([0, 2, 0, -2, 0]);
    for (let t = 0; t < 2000; t += 13) {
      expect(noticeMarkMotion(t)!.bob).toBe(noticeMarkMotion(t + 500)!.bob);
      expect(Math.abs(noticeMarkMotion(t)!.bob)).toBeLessThanOrEqual(2);
    }
  });
});
