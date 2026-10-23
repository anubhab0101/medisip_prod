// Runs only against a separate restore database, never the clean shop.
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { writeFile } from "node:fs/promises";
import { zipSync, strToU8 } from "fflate";
import { chromium, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
process.loadEnvFile(".env.local");
process.loadEnvFile(".env.migration.local");
const database = process.argv[2];
if (!/^medishop_restore_\d+$/.test(database ?? ""))
  throw new Error("Supply a separate restore-rehearsal database name.");
const url = new URL(process.env.MIGRATION_DATABASE_URL);
url.pathname = `/${database}`;
const origin = "http://127.0.0.1:3005";
const prisma = new PrismaClient({ datasourceUrl: url.toString() });
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3005",
  ],
  {
    windowsHide: true,
    stdio: "ignore",
    env: {
      ...process.env,
      DATABASE_URL: url.toString(),
      AUTH_URL: origin,
      APP_URL: origin,
      SMS_SEND_ENABLED: "false",
      LOCAL_PREVIEW: "true",
    },
  },
);
const browser = await chromium.launch();
const prefix = `Excel verification ${Date.now()}`;
const headers = [
  "name",
  "genericName",
  "strength",
  "dosageForm",
  "manufacturer",
  "hsn",
  "gstPercent",
  "packSize",
  "barcode",
  "schedule",
  "reorderLevel",
  "rack",
];
const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
function workbook(rows) {
  const sheet = (values) =>
    `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${values.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => `<c r="${String.fromCharCode(65 + c)}${r + 1}" ${typeof value === "number" ? "" : 't="inlineStr"'}>${typeof value === "number" ? `<v>${value}</v>` : `<is><t>${escape(value)}</t></is>`}</c>`).join("")}</row>`).join("")}</sheetData></worksheet>`;
  const files = {
    "[Content_Types].xml":
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    "_rels/.rels":
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml":
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Medicines" sheetId="1" r:id="rId1"/><sheet name="Ignored" sheetId="2" r:id="rId2"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": sheet(rows),
    "xl/worksheets/sheet2.xml": sheet([["This sheet must not be imported"]]),
  };
  return Buffer.from(
    zipSync(
      Object.fromEntries(
        Object.entries(files).map(([key, value]) => [key, strToU8(value)]),
      ),
    ),
  );
}
const result = [];
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error("Isolated preview exited.");
    try {
      if ((await fetch(origin + "/login")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(500);
  }
  if (!ready) throw new Error("Isolated preview did not start.");
  for (const width of [1280, 360]) {
    console.log(`Checking Excel import at ${width}px.`);
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const name = `${prefix} ${width}`,
      barcode = `000${Date.now()}${width}`;
    const row = [
      name,
      "Ingredient",
      "100 mg",
      "tablet",
      "Test",
      "30049099",
      12.5,
      "10 tablets",
      barcode,
      "NONE",
      12,
      "A1",
    ];
    const file = {
      name: "catalogue.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: workbook([
        headers,
        row,
        [...row.slice(0, 6), "invalid", ...row.slice(7)],
      ]),
    };
    await page.goto(origin + "/login");
    await page
      .getByLabel("Email", { exact: true })
      .fill(process.env.SEED_OWNER_EMAIL);
    await page
      .getByLabel("Password", { exact: true })
      .fill(process.env.SEED_OWNER_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/dashboard");
    await page.goto(origin + "/medicines/import");
    const input = page.locator('input[type="file"]');
    await expect(input).toBeEnabled();
    await input.setInputFiles(file);
    await expect(
      page.getByText("1 ready · 1 rows need fixing", { exact: true }),
    ).toBeVisible();
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Import 1 medicines", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Medicines imported");
    const medicine = await prisma.medicine.findFirstOrThrow({
      where: { name },
      include: { branchSettings: true },
    });
    expect(medicine.barcode).toBe(barcode);
    expect(medicine.gstBasisPoints).toBe(1250);
    expect(medicine.branchSettings[0].reorderLevel).toBe(12);
    expect(await prisma.medicine.count({ where: { name } })).toBe(1);
    await input.setInputFiles([]);
    await input.setInputFiles(file);
    await expect(
      page.getByText("0 ready · 2 rows need fixing", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Import 0 medicines", exact: true }),
    ).toBeDisabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.local/xlsx-import-${width}.png`,
      fullPage: true,
    });
    await input.setInputFiles({
      name: "broken.xlsx",
      mimeType: file.mimeType,
      buffer: Buffer.from("not a workbook"),
    });
    await expect(page.locator('main [role="alert"]')).toContainText(
      "Could not read the file",
    );
    await input.setInputFiles({
      name: "large.xlsx",
      mimeType: file.mimeType,
      buffer: Buffer.alloc(2 * 1024 * 1024 + 1),
    });
    await expect(page.locator('main [role="alert"]')).toContainText(
      "smaller than 2 MB",
    );
    expect(errors).toEqual([]);
    result.push({
      width,
      numericTax: true,
      textBarcodePreserved: true,
      validRowsOnly: true,
      duplicateBlocked: true,
      corruptFileRejected: true,
      sizeLimit: true,
    });
    await page.close();
  }
  await writeFile(
    ".local/xlsx-import-result.json",
    JSON.stringify({ database, result, mainShopTouched: false }, null, 2),
  );
  console.log(
    "XLSX browser import passed on desktop/mobile: text barcodes, numeric tax, first sheet, validation, duplicates, corrupt files and size limit.",
  );
} finally {
  await browser.close();
  server.kill();
  const ids = (
    await prisma.medicine.findMany({
      where: { name: { startsWith: prefix } },
      select: { id: true },
    })
  ).map((row) => row.id);
  await prisma.branchMedicine.deleteMany({
    where: { medicineId: { in: ids } },
  });
  await prisma.medicine.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
}
