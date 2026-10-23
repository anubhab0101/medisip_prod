import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { renderReceipt } from "./render";
export const receiptHeaders = {
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Cache-Control": "no-store, private",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};
type Lookup = (hash: string) => Promise<unknown | null>;
export function receiptHandler(lookup: Lookup, expectedHost: string) {
  const attempts = new Map<string, { count: number; resets: number }>();
  return async (req: IncomingMessage, res: ServerResponse) => {
    for (const [key, value] of Object.entries(receiptHeaders))
      res.setHeader(key, value);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    function reject(status: number, message = "Receipt unavailable") {
      res.statusCode = status;
      res.end(
        `<!doctype html><html lang="en"><meta charset="utf-8"><title>${message}</title><body><h1>${message}</h1><p>Ask the shop for a fresh receipt link.</p></body></html>`,
      );
    }
    if (req.headers.host?.toLowerCase() !== expectedHost.toLowerCase()) {
      reject(404);
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      reject(405);
      return;
    }
    const match = /^\/r\/([A-Za-z0-9_-]{43})$/.exec(req.url ?? "");
    if (!match) {
      reject(404);
      return;
    }
    const now = Date.now(),
      ip = req.socket.remoteAddress ?? "unknown";
    for (const [key, value] of attempts)
      if (value.resets < now) attempts.delete(key);
    const count = attempts.get(ip) ?? { count: 0, resets: now + 60000 };
    if (count.count >= 120 || (!attempts.has(ip) && attempts.size >= 5000)) {
      reject(429, "Please try again shortly");
      return;
    }
    count.count++;
    attempts.set(ip, count);
    try {
      const data = await lookup(
        createHash("sha256").update(match[1]).digest("hex"),
      );
      if (!data) {
        reject(404);
        return;
      }
      const html = renderReceipt(data);
      res.statusCode = 200;
      res.end(req.method === "HEAD" ? undefined : html);
    } catch {
      reject(503, "Receipt temporarily unavailable");
    }
  };
}
