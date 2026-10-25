import { describe, expect, it } from "vitest";
import { mobileBindSharesMainPort, parseStartupOptions, supportedNodeVersion } from "./startup";

describe("Node version requirement", () => {
  it.each(["20.20.2", "21.9.0", "22.0.0", "22.11.99", "22.12.99", "", "v22.12.0", "22.12"])("rejects %s", (version) => {
    expect(supportedNodeVersion(version)).toBe(false);
  });
  it.each(["22.13.0", "22.13.1", "22.99.0", "23.0.0", "26.4.0"])("accepts %s", (version) => {
    expect(supportedNodeVersion(version)).toBe(true);
  });
});

describe("mobile/main bind overlap", () => {
  it("reserves loopback, wildcards and IPv4-mapped loopback/wildcards", () => {
    for (const address of ["127.0.0.1", "0.0.0.0", "::", "::ffff:127.0.0.1", "::FFFF:7F00:1", "::ffff:0.0.0.0", "::ffff:0:0"]) {
      expect(mobileBindSharesMainPort(address)).toBe(true);
    }
    for (const address of ["::1", "127.0.0.2", "192.168.1.10", "100.64.0.1", "::ffff:192.168.1.10", "2001:db8::1"]) {
      expect(mobileBindSharesMainPort(address)).toBe(false);
    }
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
  it("enables the separate mobile bind only when explicitly requested", () => {
    expect(parseStartupOptions(["--mobile", "127.0.0.1:8791", "--no-open"])).toEqual({ options: {
      port: 8790, open: false, mobile: { host: "127.0.0.1", port: 8791 },
    } });
    expect(parseStartupOptions(["--mobile=[::]:8791"])).toEqual({ options: {
      port: 8790, open: true, mobile: { host: "::", port: 8791 },
    } });
    expect(parseStartupOptions(["--mobile", "0.0.0.0:8791"])).toHaveProperty("options.mobile.host", "0.0.0.0");
    for (const value of ["", "127.0.0.1", "http://127.0.0.1:8791", "127.0.0.1:0", "localhost:65536", "localhost:01", "::1:8791", "a:1/path"]) {
      expect(parseStartupOptions([`--mobile=${value}`])).toHaveProperty("error");
    }
    expect(parseStartupOptions(["--mobile"])).toHaveProperty("error");
    expect(parseStartupOptions(["--mobile", "--no-open"])).toHaveProperty("error");
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
