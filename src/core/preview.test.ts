import { describe, expect, it } from "vitest";
import { previewDraft, previewNotice, previewOutput, previewRecipients, previewUrl, previewUrls } from "./preview";

describe("preview recipients", () => {
  const writer = { session: "writer", name: "Writer", active: true, canTalk: true };
  const other = { session: "reviewer", name: "Reviewer", active: true, canTalk: true };
  const shell = { session: "shell", name: "Shell", active: true, canTalk: false };
  it("uses a live conversation-capable writer directly", () => {
    expect(previewRecipients([writer, other], writer.session)).toBeUndefined();
  });
  it("offers live party members when a saved writer has ended", () => {
    expect(previewRecipients([{ ...writer, active: false }, other, shell], writer.session)).toEqual([other, shell]);
  });
  it("also falls back for missing or terminal-only writers", () => {
    expect(previewRecipients([other], "removed")).toEqual([other]);
    expect(previewRecipients([shell, other], shell.session)).toEqual([shell, other]);
    expect(previewRecipients([other])).toEqual([other]);
    expect(previewRecipients([{ ...writer, active: false }], writer.session)).toEqual([]);
  });
});

describe("local preview URLs", () => {
  it("accepts only literal local HTTP(S), with a real port", () => {
    for (const url of ["http://localhost:5173/", "https://127.0.0.1:444/a?q=1#x", "http://[::1]:8000/", "http://localhost", "https://localhost"]) {
      expect(previewUrl(url, 18995).ok).toBe(true);
    }
    expect(previewUrl("HTTP://LOCALHOST:05173?x=1", 18995)).toEqual({ ok: true, origin: "http://localhost:5173", url: "http://localhost:5173/?x=1" });
    for (const url of ["https://example.com/", "http://localhost.evil:5173", "http://127.1:5173", "file:///tmp/a", "//localhost:5173", "http://user@localhost:5173", "http://localhost:5173\\@evil/", "http://localhost:5173/a\nb"]) {
      expect(previewUrl(url, 18995).ok).toBe(false);
    }
    for (const port of ["0", "65536", "-1", "1.5", "", "abc"]) expect(previewUrl(`http://localhost:${port}/`, 18995)).toEqual({ ok: false, reason: "port" });
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) expect(previewUrl(`https://${host}:18995/`, 18995)).toEqual({ ok: false, reason: "self" });
    expect(previewUrl("http://localhost", 80)).toEqual({ ok: false, reason: "self" });
  });
  it("waits for complete lines even when ANSI and URLs arrive one character at a time", () => {
    let tail = ""; const urls: string[] = [];
    for (const data of "\x1b[32mLocal:\x1b[0m http://localhost:5173/\r\n") {
      const result = previewOutput(tail, data, 18995); tail = result.tail; urls.push(...result.urls);
    }
    expect(urls).toEqual(["http://localhost:5173/"]); expect(tail).toBe("");
    expect(previewOutput("", "x".repeat(20000), 18995).tail).toHaveLength(8192);
  });
  it("finds distinct URLs through terminal colors and controls, not foreign URLs", () => {
    expect(previewUrls("\x1b[32mLocal:\x1b[0m \x1b[1mhttp://localhost:5173/\x1b[0m\r\n" +
      "\x1b]0;window title\x07http://[::1]:8000/test\n(http://localhost:5173/)\n" +
      "http://127.0.0.1:18995/ https://example.com/ http://localhost.evil:5173/", 18995))
      .toEqual(["http://localhost:5173/", "http://[::1]:8000/test"]);
  });
});

describe("preview notices", () => {
  const message = { type: "yushario-preview", url: "http://localhost:5173/next", title: "App", errors: ["Oops"], count: 1 };
  it("accepts only the linked origin and that origin's page URL", () => {
    expect(previewNotice(message, "http://localhost:5173", "http://localhost:5173/", 18995)?.errors).toEqual(["Oops"]);
    for (const origin of ["http://localhost:8000", "http://evil.test", "null", "http://127.0.0.1:5173"]) {
      expect(previewNotice(message, origin, "http://localhost:5173/", 18995)).toBeUndefined();
    }
    expect(previewNotice({ ...message, url: "http://localhost:8000/" }, "http://localhost:5173", "http://localhost:5173/", 18995)).toBeUndefined();
    expect(previewNotice({ ...message, errors: [{}] }, "http://localhost:5173", "http://localhost:5173/", 18995)).toBeUndefined();
  });
  it("keeps notices small and produces a human-editable bilingual draft", () => {
    const page = previewNotice({ ...message, errors: Array(30).fill("x".repeat(1000)), count: 30, title: "t".repeat(300) }, "http://localhost:5173", "http://localhost:5173/", 18995)!;
    expect(page.errors).toHaveLength(20); expect(page.errors[0]).toHaveLength(500); expect(page.title).toHaveLength(200); expect(page.count).toBe(30);
    expect(previewDraft(page, "en")).toContain("Please check these preview errors.");
    expect(previewDraft(page, "ja")).toContain("プレビューの エラーを たしかめて。");
    expect(previewDraft(page, "en")).toContain(page.url);
    expect(previewDraft(page, "en").length).toBeLessThanOrEqual(8000);
  });
});
