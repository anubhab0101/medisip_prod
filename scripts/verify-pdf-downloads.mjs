// Isolated database fixtures only; never sends messages or touches the clean shop.
import { writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { isolatedPreview } from "./isolated-preview.mjs";
const test = await isolatedPreview(process.argv[2]);
const { prisma, browser, origin } = test;
const branches = [];
let medicine, sale;
await mkdir(".local/pdf-check", { recursive: true });
try {
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: process.env.SEED_OWNER_EMAIL },
  });
  for (const name of ["PDF verification", "Different shop"]) {
    branches.push(
      await prisma.branch.create({
        data: {
          name,
          address: "Test",
          phone: "",
          memberships: { create: { userId: owner.id, role: "OWNER" } },
        },
      }),
    );
  }
  const branch = branches[0];
  medicine = await prisma.medicine.create({
    data: { name: "PDF fixture medicine" },
  });
  const batch = await prisma.batch.create({
    data: {
      branchId: branch.id,
      medicineId: medicine.id,
      batchNo: "TEST-ONLY",
      expiryDate: new Date("2035-12-31"),
      purchasePricePaise: 100,
      mrpPaise: 1234567,
      qtyOnHand: 10,
    },
  });
  const names = Array.from(
    { length: 65 },
    (_, i) =>
      `ITEM-${String(i + 1).padStart(3, "0")} Long medicine name with batch details and wrapping ${i === 0 ? "दवा केंद्र / ଔଷଧ ଦୋକାନ" : ""}`,
  );
  const unit = 1234567,
    total = unit * names.length;
  sale = await prisma.sale.create({
    data: {
      branchId: branch.id,
      userId: owner.id,
      operationId: randomUUID(),
      invoiceNo: "PDF-TEST-0001",
      status: "PAID",
      subtotalPaise: total,
      discountPaise: 0,
      taxablePaise: total,
      cgstPaise: 0,
      sgstPaise: 0,
      roundOffPaise: 0,
      totalPaise: total,
      shopSnapshot: {
        name: "Saved shop / दवा केंद्र / ଔଷଧ ଦୋକାନ",
        address: "Saved address, Odisha",
        phone: "",
        gstin: "TEST-GST",
        drugLicenseNo: "TEST-LICENCE",
      },
      prescriptionRef: "PRIVATE-PRESCRIPTION",
      doctorName: "PRIVATE-DOCTOR",
      customerSnapshot: { name: "PRIVATE-CUSTOMER", phone: "+919999999999" },
      items: {
        create: names.map((name) => ({
          medicineId: medicine.id,
          batchId: batch.id,
          name,
          hsn: "30049099",
          schedule: "NONE",
          batchNo: "TEST-ONLY",
          expiryDate: batch.expiryDate,
          quantity: 1,
          unitPricePaise: unit,
          unitCostPaise: 100,
          discountBasisPoints: 0,
          discountPaise: 0,
          gstBasisPoints: 0,
          taxablePaise: unit,
          cgstPaise: 0,
          sgstPaise: 0,
          totalPaise: unit,
        })),
      },
      payments: { create: { method: "CASH", amountPaise: total } },
      returns: {
        create: {
          userId: owner.id,
          operationId: randomUUID(),
          reason: "Recorded test return",
          amountPaise: unit,
          cashRefundPaise: unit,
          creditRefundPaise: 0,
          refundMethod: "CASH",
          items: [],
        },
      },
    },
  });
  const pdfPath = `/api/bills/${sale.id}/pdf`;
  const guest = await browser.newContext();
  expect((await guest.request.get(origin + pdfPath)).status()).toBe(401);
  expect((await guest.request.get(origin + "/api/reports/pdf")).status()).toBe(
    401,
  );
  await guest.close();
  const results = [];
  for (const width of [1280, 360]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin + "/login");
    await page
      .getByLabel("Email", { exact: true })
      .fill(process.env.SEED_OWNER_EMAIL);
    await page
      .getByLabel("Password", { exact: true })
      .fill(process.env.SEED_OWNER_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/dashboard");
    await page
      .context()
      .addCookies([{ name: "medishop.branch", value: branch.id, url: origin }]);
    await page.goto(origin + `/bills/${sale.id}`);
    const downloadWait = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download PDF", exact: true }).click();
    const download = await downloadWait;
    expect(download.suggestedFilename()).toBe("PDF-TEST-0001.pdf");
    expect(await download.failure()).toBeNull();
    await download.saveAs(`.local/pdf-check/invoice-${width}.pdf`);
    const response = await page.request.get(origin + pdfPath);
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    expect(response.headers()["content-type"]).toBe("application/pdf");
    expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
    await page.goto(origin + "/reports?kind=expiry");
    const reportWait = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download PDF", exact: true }).click();
    const report = await reportWait;
    expect(await report.failure()).toBeNull();
    await report.saveAs(`.local/pdf-check/report-${width}.pdf`);
    if (width === 1280) {
      for (const kind of [
        "sales",
        "gst",
        "profit",
        "products",
        "slow",
        "expiry",
        "purchases",
        "staff",
        "credit",
      ]) {
        const exported = await page.request.get(
          `${origin}/api/reports/pdf?kind=${kind}`,
        );
        expect(exported.status(), kind).toBe(200);
        expect((await exported.body()).subarray(0, 5).toString()).toBe("%PDF-");
        await writeFile(
          `.local/pdf-check/report-${kind}.pdf`,
          await exported.body(),
        );
      }
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.local/pdf-check/report-ui-${width}.png`,
      fullPage: true,
    });
    await page
      .context()
      .addCookies([
        { name: "medishop.branch", value: branches[1].id, url: origin },
      ]);
    expect((await page.request.get(origin + pdfPath)).status()).toBe(404);
    await page
      .context()
      .addCookies([{ name: "medishop.branch", value: branch.id, url: origin }]);
    await prisma.membership.update({
      where: { userId_branchId: { userId: owner.id, branchId: branch.id } },
      data: { role: "DOCTOR" },
    });
    expect((await page.request.get(origin + pdfPath)).status()).toBe(403);
    expect((await page.request.get(origin + "/api/reports/pdf")).status()).toBe(
      403,
    );
    await prisma.membership.update({
      where: { userId_branchId: { userId: owner.id, branchId: branch.id } },
      data: { role: "OWNER" },
    });
    await prisma.branch.update({
      where: { id: branch.id },
      data: { demo: true },
    });
    expect((await page.request.get(origin + pdfPath)).status()).toBe(403);
    await prisma.branch.update({
      where: { id: branch.id },
      data: { demo: false },
    });
    expect(errors).toEqual([]);
    results.push({
      width,
      invoiceDownload: true,
      reportDownload: true,
      guestDenied: true,
      otherShopDenied: true,
      roleRevocationDenied: true,
      practiceInvoiceDenied: true,
      consoleErrors: 0,
    });
    await page.close();
  }
  await writeFile(
    ".local/pdf-check/browser-result.json",
    JSON.stringify(results, null, 2),
  );
  console.log(
    "PDF browser download and permission checks passed on desktop and mobile; inspect generated PDFs separately.",
  );
} finally {
  if (sale) {
    await prisma.saleReturn.deleteMany({ where: { saleId: sale.id } });
    await prisma.payment.deleteMany({ where: { saleId: sale.id } });
    await prisma.saleItem.deleteMany({ where: { saleId: sale.id } });
    await prisma.sale.delete({ where: { id: sale.id } });
  }
  for (const branch of branches) {
    await prisma.batch.deleteMany({ where: { branchId: branch.id } });
    await prisma.membership.deleteMany({ where: { branchId: branch.id } });
    await prisma.branch.delete({ where: { id: branch.id } });
  }
  if (medicine) await prisma.medicine.delete({ where: { id: medicine.id } });
  await test.close();
}
