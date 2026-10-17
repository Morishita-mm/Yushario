import { tr } from "./language";
import type { IncomingMessage, ServerResponse } from "node:http";

export const EVENT_BODY_LIMIT = 1024 * 1024;
export const SETTINGS_BODY_LIMIT = 4096;
export const ACTION_BODY_LIMIT = 64 * 1024;

// Byte limits also cover multibyte UTF-8 input; do not accumulate oversized bodies.
export async function readJsonBody(request: IncomingMessage, response: ServerResponse, limit: number)
  : Promise<{ ok: true; value: unknown } | { ok: false }> {
  const reject = (status: number, error: string): { ok: false } => {
    response.writeHead(status, { "Content-Type": "application/json", Connection: "close" }).end(JSON.stringify({ error }));
    request.resume();
    return { ok: false };
  };
  if (Number(request.headers["content-length"]) > limit) return reject(413, tr("送る内容が 長すぎる。", "Message too long"));
  try {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > limit) return reject(413, tr("送る内容が 長すぎる。", "Message too long"));
      chunks.push(buffer);
    }
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch { return reject(400, tr("内容は JSON で送ろう。", "Send JSON content")); }
}
