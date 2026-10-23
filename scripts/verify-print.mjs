// Isolated browser fixture: never connects to or writes the application database.
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

await mkdir(".local/print-check", { recursive: true });
const bundle = await build({
  stdin: {
    contents: `import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { PrintButton } from './src/components/shared/print-button';
      createRoot(document.getElementById('controls')).render(<PrintButton receipt />);`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  jsx: "automatic",
  platform: "browser",
});
const css = await readFile("src/app/globals.css", "utf8");
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent(`<html><head><title>Isolated print verification</title></head><body>
    <header class="app-header">Staff navigation</header>
    <main class="app-main"><div id="controls" class="no-print"></div>
    <article class="panel invoice"><h2>Print layout fixture</h2>
    <p>Long shop address for wrapping verification, Bhubaneswar, Odisha</p>
    <div class="page-title"><strong>TEST-0001</strong><span>08 October 2026</span></div>
    <div class="table-wrap"><table><thead><tr><th>Medicine</th><th>HSN</th><th>Qty</th><th>MRP</th><th>GST</th><th>Amount</th></tr></thead><tbody>
    ${Array.from({ length: 16 }, (_, index) => `<tr><td>Long medicine name ${index + 1}<small>BATCH-123456789 · 2028-10</small></td><td data-label="HSN">30049099</td><td data-label="Qty">999</td><td data-label="MRP">₹12,345.67</td><td data-label="GST">18%</td><td data-label="Amount">₹1,23,456.78</td></tr>`).join("")}
    </tbody></table></div><div class="totals"><div class="grand"><span>Total</span><strong>₹1,23,456.78</strong></div></div></article></main></body></html>`);
  await page.addStyleTag({ content: css.replace(/@import[^;]+;/g, "") });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(() => {
    window.print = () => {
      window.printCalls = (window.printCalls || 0) + 1;
    };
  });
  await page.getByLabel("Print paper size").selectOption("thermal");
  await page.getByRole("button", { name: "Print / Save PDF" }).click();
  assert.equal(
    await page.locator("body").getAttribute("data-print-layout"),
    "thermal",
  );
  await page.emulateMedia({ media: "print" });
  assert.equal(await page.locator(".app-header").isVisible(), false);
  assert.equal(await page.locator("#controls").isVisible(), false);
  const bounds = await page.locator(".invoice").evaluate((invoice) => {
    const box = invoice.getBoundingClientRect();
    return {
      width: box.width,
      overflow: [...invoice.querySelectorAll("td, .totals")].some(
        (element) => element.getBoundingClientRect().right > box.right + 1,
      ),
    };
  });
  assert.ok(
    bounds.width <= 280,
    "Thermal invoice must fit the 74mm printable area",
  );
  assert.equal(bounds.overflow, false, "Receipt content must not overflow");
  await page.setViewportSize({ width: 303, height: 900 });
  await page.screenshot({
    path: ".local/print-check/thermal.png",
    fullPage: true,
  });
  await page.pdf({
    path: ".local/print-check/thermal.pdf",
    width: "80mm",
    height: "297mm",
    printBackground: true,
  });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  assert.equal(
    await page.locator("body").getAttribute("data-print-layout"),
    null,
  );
  assert.equal(await page.locator("#receipt-page-size").count(), 0);
  await page.emulateMedia({ media: "screen" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByLabel("Print paper size").selectOption("a4");
  await page.getByRole("button", { name: "Print / Save PDF" }).click();
  assert.equal(
    await page.locator("body").getAttribute("data-print-layout"),
    null,
  );
  assert.equal(await page.evaluate(() => window.printCalls), 2);
  await page.pdf({
    path: ".local/print-check/a4.pdf",
    format: "A4",
    preferCSSPageSize: true,
  });
  await writeFile(
    ".local/print-check/result.json",
    JSON.stringify(
      {
        passed: true,
        thermalWidthPx: bounds.width,
        overflow: false,
        a4Reset: true,
        databaseTouched: false,
      },
      null,
      2,
    ),
  );
  console.log(
    "Print checks passed: 80mm layout, long amounts, staff controls hidden, A4 reset; no database access.",
  );
} finally {
  await browser.close();
}
