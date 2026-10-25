import type { IncomingMessage, ServerResponse } from "node:http";

export function mobileJson(response: ServerResponse, value: object, status = 200): void {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store",
    ...(status !== 200 ? { Connection: "close" } : {}) }).end(JSON.stringify(value));
}
export function mobileRejected(response: ServerResponse): void { mobileJson(response, { error: "rejected" }, 400); }

export function readMobileJson(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    const cleanup = (): void => { request.off("data", data); request.off("end", end); request.off("error", error); request.off("aborted", aborted); };
    const error = (): void => { cleanup(); reject(Error("Invalid mobile body")); };
    const aborted = (): void => error();
    const data = (chunk: Buffer): void => {
      size += chunk.length;
      if (size > 1048576) { error(); request.resume(); return; }
      chunks.push(chunk);
    };
    const end = (): void => {
      cleanup();
      try { resolve(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)))); }
      catch { reject(Error("Invalid mobile JSON")); }
    };
    request.on("data", data); request.once("end", end); request.once("error", error); request.once("aborted", aborted);
  });
}

// Bounded per-minute buckets, keyed by socket IP (never forwarded headers) and registered device.
export class MobileRateLimit {
  private minute = -1;
  private counts = new Map<string, number>();
  allow(key: string): boolean {
    const minute = Math.floor(Date.now() / 60000);
    if (minute !== this.minute) { this.minute = minute; this.counts.clear(); }
    if (!this.counts.has(key) && this.counts.size >= 2048) return false;
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    return count <= 30;
  }
}
