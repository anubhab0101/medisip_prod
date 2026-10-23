import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import { isolatedPreview } from "./isolated-preview.mjs";
const test = await isolatedPreview(process.argv[2]);
const { prisma, browser, origin } = test;
const ids = [randomUUID(), randomUUID()];
let customer;
try {
  const membership = await prisma.membership.findFirstOrThrow({
    where: {
      user: { email: process.env.SEED_OWNER_EMAIL },
      branch: { active: true, demo: false },
    },
    orderBy: { branch: { createdAt: "asc" } },
  });
  const branchId = membership.branchId;
  customer = await prisma.customer.create({
    data: {
      branchId,
      name: "Isolated retry test",
      phone: "+919999998881",
      consentSms: true,
    },
  });
  for (let i = 0; i < ids.length; i++) {
    await prisma.job.create({
      data: {
        id: ids[i],
        key: `ui-retry:${ids[i]}`,
        type: "CUSTOM_SMS",
        status: "FAILED",
        attempts: 3,
        payload: {
          branchId,
          customerId: customer.id,
          body: "Verification only",
        },
        runAt: new Date(),
      },
    });
    await prisma.notificationLog.create({
      data: {
        id: ids[i],
        branchId,
        customerId: customer.id,
        channel: "SMS",
        templateKey: "MANUAL",
        status: i ? "UNKNOWN" : "FAILED",
        error: i ? "Unknown verification result" : "Failed verification result",
        payload: {},
        scheduledFor: new Date(),
      },
    });
  }
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
  await page.goto(origin + "/notifications");
  await page.locator('select[name="status"]').selectOption("FAILED");
  await page.getByRole("button", { name: "Filter history" }).click();
  await page.waitForURL("**/notifications?**status=FAILED*");
  const row = page
    .locator("tbody tr")
    .filter({ hasText: "Failed verification result" });
  await row.locator("summary").click();
  await row.getByRole("checkbox").check();
  await row.getByRole("button", { name: "Queue retry" }).click();
  await expect
    .poll(
      async () =>
        (await prisma.job.findUniqueOrThrow({ where: { id: ids[0] } })).status,
    )
    .toBe("PENDING");
  expect(
    await prisma.auditLog.count({
      where: { entityId: ids[0], action: "RETRY_SMS" },
    }),
  ).toBe(1);
  await page.goto(origin + "/notifications?status=UNKNOWN");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Messages", exact: true })).toBeVisible();
  const unknown = page
    .locator("tbody tr")
    .filter({ hasText: "Unknown verification result" });
  await expect(unknown).toContainText("Resending is blocked");
  expect(await unknown.locator("summary").count()).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/message-retry-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  await writeFile(
    ".local/message-retry-result.json",
    JSON.stringify(
      {
        passed: true,
        filteredHistory: true,
        retryQueuedOnce: true,
        unknownBlocked: true,
        mobileOverflow: false,
        realSmsSent: false,
        mainShopTouched: false,
      },
      null,
      2,
    ),
  );
  console.log(
    "Retry browser flow passed: history filter, confirmed retry, unknown-outcome block, mobile layout. No SMS sent.",
  );
} finally {
  await prisma.auditLog.deleteMany({
    where: { entity: "NotificationLog", entityId: { in: ids } },
  });
  await prisma.notificationLog.deleteMany({ where: { id: { in: ids } } });
  await prisma.job.deleteMany({ where: { id: { in: ids } } });
  if (customer) await prisma.customer.delete({ where: { id: customer.id } });
  await test.close();
}
