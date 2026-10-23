import { writeFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import { isolatedPreview } from "./isolated-preview.mjs";
const test = await isolatedPreview(process.argv[2]);
const { prisma, browser, origin } = test;
const branches = [],
  results = [];
let sourceId;
try {
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: process.env.SEED_OWNER_EMAIL },
  });
  const source = await prisma.branch.create({
    data: {
      name: "Practice UI verification",
      address: "Test",
      phone: "",
      memberships: { create: { userId: owner.id, role: "OWNER" } },
    },
  });
  sourceId = source.id;
  branches.push(sourceId);
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
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
    .addCookies([{ name: "medishop.branch", value: sourceId, url: origin }]);
  await page.goto(origin + "/settings/practice");
  await page.locator('input[name="confirmed"]').check();
  await page
    .getByRole("button", { name: "Create practice shop", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reset practice shop", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  const first = (await page.context().cookies()).find(
    (c) => c.name === "medishop.branch",
  ).value;
  branches.push(first);
  expect(await prisma.batch.count({ where: { branchId: first } })).toBe(3);
  await page.locator('input[name="confirmed"]').check();
  await page
    .getByRole("button", { name: "Reset practice shop", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await page.context().cookies()).find(
          (c) => c.name === "medishop.branch",
        ).value,
      { timeout: 20000 },
    )
    .not.toBe(first);
  const second = (await page.context().cookies()).find(
    (c) => c.name === "medishop.branch",
  ).value;
  branches.push(second);
  await page.waitForLoadState("networkidle");
  expect(
    (await prisma.branch.findUniqueOrThrow({ where: { id: first } })).active,
  ).toBe(false);
  expect(await prisma.batch.count({ where: { branchId: first } })).toBe(3);
  expect(await prisma.batch.count({ where: { branchId: sourceId } })).toBe(0);
  await expect(
    page.locator('select[name="branchId"] option[value="' + first + '"]'),
  ).toHaveCount(0);
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.local/practice-${width}.png`,
      fullPage: true,
    });
    results.push({ width, noOverflow: true });
  }
  expect(errors).toEqual([]);
  await writeFile(
    ".local/practice-result.json",
    JSON.stringify(
      {
        results,
        createResetPassed: true,
        realShopUnchanged: true,
        consoleErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "Practice create/reset, archive retention and responsive UI passed on isolated database.",
  );
} finally {
  // Follow committed audit links even if a browser assertion failed mid-operation.
  for (let i = 0; i < 3; i++) {
    const audits = await prisma.auditLog.findMany({
      where: {
        branchId: { in: branches },
        action: { in: ["CREATE_PRACTICE", "RESET_PRACTICE"] },
      },
      select: { entityId: true },
    });
    branches.push(...audits.map((a) => a.entityId));
  }
  const medicines = await prisma.branchMedicine.findMany({
    where: { branchId: { in: branches } },
    select: { medicineId: true },
  });
  await prisma.stockMovement.deleteMany({
    where: { branchId: { in: branches } },
  });
  await prisma.batch.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.branchMedicine.deleteMany({
    where: { branchId: { in: branches } },
  });
  await prisma.medicine.deleteMany({
    where: { id: { in: medicines.map((m) => m.medicineId) } },
  });
  await prisma.supplier.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.auditLog.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.membership.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.branch.deleteMany({ where: { id: { in: branches } } });
  await test.close();
}
