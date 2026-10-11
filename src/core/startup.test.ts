import { describe, expect, it } from "vitest";
import { parseStartupOptions, supportedNodeVersion } from "./startup";

describe("Node version requirement", () => {
  it.each(["20.20.2", "21.9.0", "22.0.0", "22.11.99", "", "v22.12.0", "22.12"])("rejects %s", (version) => {
    expect(supportedNodeVersion(version)).toBe(false);
  });
  it.each(["22.12.0", "22.12.1", "22.99.0", "23.0.0", "26.4.0"])("accepts %s", (version) => {
    expect(supportedNodeVersion(version)).toBe(true);
  });
});

describe("startup options", () => {
  it("uses defaults and lets --port override PORT", () => {
    expect(parseStartupOptions([])).toEqual({ options: { port: 8790, open: true } });
    expect(parseStartupOptions([], "8800", false)).toEqual({ options: { port: 8800, open: false } });
    expect(parseStartupOptions(["--port", "8801", "--no-open"], "bad")).toEqual({ options: { port: 8801, open: false } });
    expect(parseStartupOptions(["--port=65535"], "8800")).toEqual({ options: { port: 65535, open: true } });
    expect(parseStartupOptions(["--port", "1"])).toEqual({ options: { port: 1, open: true } });
  });
  it.each(["--help", "-h"])("handles %s even with an invalid PORT", (arg) => {
    expect(parseStartupOptions([arg], "bad")).toEqual({ help: true });
  });
  it.each(["", "0", "65536", "99999", "-1", "1.5", "abc", "Infinity"])("rejects port %s", (port) => {
    expect(parseStartupOptions([`--port=${port}`])).toHaveProperty("error");
    expect(parseStartupOptions([], port)).toHaveProperty("error");
  });
  it.each([["--bogus"], ["--port"], ["--port", "--no-open"], ["--port", ""]])("rejects invalid arguments %j", (...args) => {
    expect(parseStartupOptions(args)).toHaveProperty("error");
  });
});
