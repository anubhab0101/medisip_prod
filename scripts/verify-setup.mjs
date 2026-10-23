import { writeFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import { isolatedPreview } from "./isolated-preview.mjs";
const test = await isolatedPreview(process.argv[2]);
const { prisma, browser, origin } = test;
const branches = [],
  results = [];
try {
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: process.env.SEED_OWNER_EMAIL },
  });
  for (const width of [1280, 360]) {
    const branch = await prisma.branch.create({
      data: {
        name: `Setup test ${width}`,
        address: "",
        phone: "",
        memberships: { create: { userId: owner.id, role: "OWNER" } },
      },
    });
    branches.push(branch.id);
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
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
    await page.goto(origin + "/settings/setup");
    await expect(
      page.getByRole("heading", { name: "Step 1 of 4 · Shop details" }),
    ).toBeVisible();
    await page.locator('input[name="phone"]').fill("9999999999");
    await page
      .locator('textarea[name="address"]')
      .fill("Isolated test address");
    await page.locator('input[name="drugLicenseNo"]').fill("TEST-ONLY");
    await page
      .getByRole("button", { name: "Save and continue", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Step 2 of 4 · First medicine" }),
    ).toBeVisible({ timeout: 15000 });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Step 2 of 4 · First medicine" }),
    ).toBeVisible();
    await page
      .locator('input[name="name"]')
      .fill(`Setup medicine ${branch.id}`);
    await page
      .getByRole("button", { name: "Add medicine and continue" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Add your supplier first" }),
    ).toBeVisible({ timeout: 15000 });
    await page.locator('input[name="name"]').fill("Setup supplier");
    await page
      .getByRole("button", { name: "Save supplier and continue" })
      .click();
    await expect(page.locator('input[name="invoiceNo"]')).toBeVisible({
      timeout: 15000,
    });
    await page.locator('input[name="invoiceNo"]').fill(`SETUP-${width}`);
    await page.locator('input[name="batchNo"]').fill("SETUP-BATCH");
    await page.locator('input[name="expiryMonth"]').fill("2035-12");
    await page.locator('input[name="quantity"]').fill("5");
    await page.locator('input[name="cost"]').fill("10");
    await page.locator('input[name="mrp"]').fill("20");
    await page
      .getByRole("button", { name: "Save purchase", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Step 4 of 4 · Ready to bill" }),
    ).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState("networkidle");
    const stock = await prisma.batch.findMany({
      where: { branchId: branch.id },
    });
    expect(stock).toHaveLength(1);
    expect(stock[0].qtyOnHand).toBe(5);
    expect(
      await prisma.purchase.count({ where: { branchId: branch.id } }),
    ).toBe(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.local/setup-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("link", { name: "Create your first bill" }).click();
    await page.waitForURL("**/billing");
    await page
      .getByRole("heading", { name: "New bill", exact: true })
      .waitFor();
    expect(errors).toEqual([]);
    results.push({
      width,
      savedShop: true,
      resumedAfterReload: true,
      medicine: true,
      supplier: true,
      stockQuantity: 5,
      purchases: 1,
      billingReached: true,
    });
    await page.close();
  }
  await writeFile(
    ".local/setup-result.json",
    JSON.stringify({ passed: true, results, mainShopTouched: false }, null, 2),
  );
  console.log(
    "Guided setup passed on desktop/mobile: shop details, reload/resume, medicine, supplier, opening stock and billing entry.",
  );
} finally {
  for (const branchId of branches) {
    const ids = (
      await prisma.branchMedicine.findMany({
        where: { branchId },
        select: { medicineId: true },
      })
    ).map((row) => row.medicineId);
    await prisma.auditLog.deleteMany({ where: { branchId } });
    await prisma.stockMovement.deleteMany({ where: { branchId } });
    await prisma.purchaseItem.deleteMany({ where: { purchase: { branchId } } });
    await prisma.purchase.deleteMany({ where: { branchId } });
    await prisma.batch.deleteMany({ where: { branchId } });
    await prisma.branchMedicine.deleteMany({ where: { branchId } });
    await prisma.medicine.deleteMany({ where: { id: { in: ids } } });
    await prisma.supplier.deleteMany({ where: { branchId } });
    await prisma.membership.deleteMany({ where: { branchId } });
    await prisma.branch.delete({ where: { id: branchId } });
  }
  await test.close();
}
