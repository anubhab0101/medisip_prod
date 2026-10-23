import { afterAll, beforeAll, it, expect, vi } from "vitest";
import { createServer, request as httpRequest, type Server } from "node:http";
import { createHash } from "node:crypto";
import { receiptHandler } from "../src/features/receipts/http";
import { receiptOrigin } from "../src/features/receipts/config";
const token = "a".repeat(43);
const snapshot = {
  shop: {
    name: "Test pharmacy",
    address: "Test address",
    phone: "9999999999",
    gstin: "",
    drugLicenseNo: "TEST",
  },
  invoiceNo: "INV1",
  date: "2026-10-08",
  status: "PAID",
  practice: true,
  items: [
    {
      name: '<script>alert("x")</script>',
      batch: "B1",
      expiry: "2099-12",
      hsn: "",
      quantity: 1,
      returned: 0,
      mrp: 1000,
      total: 1000,
    },
  ],
  discount: 0,
  cgst: 0,
  sgst: 0,
  roundOff: 0,
  total: 1000,
  refunded: 0,
};
const lookup = vi.fn(async (hash: string) =>
  hash === createHash("sha256").update(token).digest("hex") ? snapshot : null,
);
let server: Server, base: string;
beforeAll(async () => {
  server = createServer((req, res) => {
    void handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  base = `http://127.0.0.1:${address.port}`;
  const handler = receiptHandler(lookup, `127.0.0.1:${address.port}`);
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});
const request = (path: string, init?: RequestInit) => fetch(base + path, init);
it("serves only the receipt without scripts, navigation, cookies or app links", async () => {
  const response = await request(`/r/${token}`);
  const html = await response.text();
  expect(response.status).toBe(200);
  expect(html).toContain("INV1");
  expect(html).not.toMatch(/<(a|form|script)\b/i);
  expect(html).toContain("&lt;script&gt;");
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("content-security-policy")).toContain(
    "default-src 'none'",
  );
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it("has no login, staff, API, root or redirect routes", async () => {
  for (const path of [
    "/",
    "/login",
    "/dashboard",
    "/billing",
    "/api/auth/session",
    "/bills/INV1",
    `/r/${token}?next=https://staff.example.com`,
  ]) {
    const response = await request(path);
    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
  }
});
it("rejects unknown tokens, write methods and alternate hosts", async () => {
  expect((await request(`/r/${"b".repeat(43)}`)).status).toBe(404);
  expect((await request(`/r/${token}`, { method: "POST" })).status).toBe(405);
  const status = await new Promise<number | undefined>((resolve, reject) => {
    const req = httpRequest(
      `${base}/r/${token}`,
      { headers: { Host: "staff.example.com" } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on("error", reject);
    req.end();
  });
  expect(status).toBe(404);
});
it("requires a different production hostname and HTTPS", () => {
  expect(() =>
    receiptOrigin(
      "https://staff.example.com",
      "https://staff.example.com",
      true,
    ),
  ).toThrow("different hostname");
  expect(() =>
    receiptOrigin(
      "http://receipts.example.net",
      "https://staff.example.com",
      true,
    ),
  ).toThrow("HTTPS");
  expect(() =>
    receiptOrigin(
      "https://receipts.example.net/login",
      "https://staff.example.com",
      true,
    ),
  ).toThrow("origin");
  expect(
    receiptOrigin(
      "https://receipts.example.net",
      "https://staff.example.com",
      true,
    ),
  ).toBe("https://receipts.example.net");
});
