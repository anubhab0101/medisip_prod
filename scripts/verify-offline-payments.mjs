import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";

const captures = [];
const server = createServer(async (req, res) => {
  if (req.url === "/api/offline/sync" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    captures.push(JSON.parse(body));
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({ saleId: "isolated-ui-test", invoiceNo: "TEST-ONLY" }),
    );
    return;
  }
  const names = {
    "/offline-shell/index.html": "text/html",
    "/offline-shell/app.js": "application/javascript",
    "/offline-shell/sw.js": "application/javascript",
    "/offline-shell/manifest.json": "application/json",
  };
  if (!names[req.url]) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.setHeader("content-type", names[req.url]);
  res.end(await readFile(`public${req.url}`));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
try {
  for (const width of [1280, 360]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}/offline-shell/index.html`);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      localStorage.setItem(
        "medishop.offline.handoff",
        JSON.stringify({
          deviceId: crypto.randomUUID(),
          secret: "test-only",
          name: "Test",
          day: new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date()),
          shop: {
            name: "Isolated test",
            address: "Test",
            phone: "",
            drugLicenseNo: "TEST",
            practice: true,
          },
          items: [
            {
              reservationId: "r",
              batchId: "b",
              medicineId: "m",
              name: "Test item",
              batchNo: "B",
              expiryDate: "2099-12-31",
              available: 5,
              unitPricePaise: 1000,
              gstBasisPoints: 0,
            },
          ],
        }),
      );
    });
    await page.reload();
    await page.locator("#billing").waitFor({ state: "visible" });
    await context.setOffline(true);
    await page.reload();
    await page.locator("#billing").waitFor({ state: "visible" });
    await page.locator("#quantity").fill("2");
    await page.locator("#line-discount").fill("10");
    await page.locator("#add").click();
    await page.locator("#bill-discount").fill("1");
    await page.locator("summary").click();
    await page.locator("#upi").fill("5");
    await page.locator("#upi-reference").fill("confirmed-upi");
    await page.locator("#card").fill("5");
    await page.locator("#card-reference").fill("confirmed-card");
    await page.locator("#save").click();
    await expect(page.locator("#status")).toContainText("Confirm the UPI");
    await page.locator("#payment-confirmed").check();
    await page.locator("#cash").fill("6");
    await page.locator("#save").click();
    await expect(page.locator("#status")).toContainText(
      "less than the remaining",
    );
    await page.locator("#cash").fill("10");
    await page.locator("#save").click();
    await page.getByText(/Provisional bill saved/).waitFor();
    await page.reload();
    await page.getByText(/Waiting to sync/).waitFor();
    assert.equal(await page.locator("#bills p").count(), 1);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await context.setOffline(false);
    await page.locator("#sync").click();
    await page.getByText(/All saved bills are synced/).waitFor();
    const payload = captures.at(-1).bill;
    assert.equal(payload.billDiscountPaise, 100);
    assert.equal(payload.items[0].discountBasisPoints, 1000);
    assert.deepEqual(
      payload.payments.map((p) => [p.method, p.amountPaise]),
      [
        ["UPI", 500],
        ["CARD", 500],
        ["CASH", 700],
      ],
    );
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(
    "Offline payment UI passed desktop/mobile: real disconnected reload, discount calculation, independent payment confirmation, insufficient cash rejection, persistent bill and sync payload. API transport is a test stub; real TiDB checkout is covered separately by remaining-features integration.",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
