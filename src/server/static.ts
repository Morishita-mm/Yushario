import { readFile, realpath, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../../", import.meta.url));
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".ico": "image/x-icon",
};

export async function serveStatic(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  let path: string;
  try {
    // Inspect before URL normalization, including percent-encoded traversal.
    path = decodeURIComponent((request.url ?? "/").split("?")[0]);
  } catch {
    response.writeHead(403).end();
    return;
  }
  if (!path.startsWith("/") || path.includes("\\") || path.includes("\0") || path.split("/").includes("..")) {
    response.writeHead(403).end();
    return;
  }
  const locations = path.startsWith("/public/") ? [["public", path.slice(8)]]
    : [["dist", path === "/" ? "index.html" : path.slice(1)], ["public", path.slice(1)]];
  for (const [directory, relative] of locations) {
    try {
      const root = await realpath(resolve(project, directory));
      const file = await realpath(resolve(root, relative));
      if (!file.startsWith(root + sep)) continue;
      const info = await stat(file);
      if (!info.isFile()) continue;
      const data = request.method === "HEAD" ? undefined : await readFile(file);
      response.writeHead(200, {
        "Content-Type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
        "Content-Length": info.size, "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
        // Pages and data change on every build; always revalidate them (bundled assets are content-hashed).
        ...(/\.(html|json)$/.test(file) ? { "Cache-Control": "no-cache" } : {}),
      }).end(data);
      return;
    } catch {
      // A missing asset/root (or unreadable file) is simply not served.
    }
  }
  response.writeHead(404).end();
}
