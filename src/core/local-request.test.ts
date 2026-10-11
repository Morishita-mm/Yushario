import { describe, expect, it } from "vitest";
import { allowedHost } from "./local-request";

describe("relay Host", () => {
  it.each(["127.0.0.1:8811", "localhost:8811"])("accepts its own loopback authority %s", (host) => {
    expect(allowedHost(host, 8811)).toBe(true);
  });
  it.each([undefined, "", "127.0.0.1", "localhost", "localhost:8790", "evil.invalid:8811", "localhost.evil:8811",
    "localhost:8811@evil.invalid", "[::1]:8811", "127.0.0.1:08811", "localhost:8811,evil.invalid:8811"])("rejects %s", (host) => {
    expect(allowedHost(host, 8811)).toBe(false);
  });
});
