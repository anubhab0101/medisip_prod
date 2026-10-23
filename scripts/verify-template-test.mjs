import { writeFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import { isolatedPreview } from "./isolated-preview.mjs";
const test = await isolatedPreview(process.argv[2]);
const { prisma, browser, origin } = test;
let customer, template;
try {
  const membership = await prisma.membership.findFirstOrThrow({
    where: {
      user: { email: process.env.SEED_OWNER_EMAIL },
      branch: { active: true, demo: false },
    },
  });
  const branchId = membership.branchId;
  customer = await prisma.customer.create({
    data: {
      branchId,
      name: "Personal template test",
      phone: "+919999998881",
      consentWhatsapp: true,
    },
  });
  template = await prisma.notificationTemplate.create({
    data: {
      branchId,
      key: `Personal test ${Date.now()}`,
      channel: "WHATSAPP",
      body: "Hello {name} from {shop}",
      active: true,
    },
  });
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
  await page.goto(origin + "/notifications/templates");
  const editor = page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: template.key }) });
  await editor.locator("summary").click();
  await editor.getByRole("link", { name: "Test with my contact" }).click();
  await page.waitForURL("**/notifications?**test=1");
  await expect(page.locator('form:has(select[name="customerId"]) select[name="channel"]')).toHaveValue("WHATSAPP");
  await page.locator('select[name="customerId"]').selectOption(customer.id);
  await page.locator('input[name="ownPhone"]').fill("9999998882");
  await page.locator('input[name="ownRecipientConfirmed"]').check();
  await page.getByRole("button", { name: "Prepare test message" }).click();
  await expect(page.locator('main [role="alert"]')).toContainText(
    "same number",
  );
  expect(
    await prisma.notificationLog.count({ where: { customerId: customer.id } }),
  ).toBe(0);
  await page.locator('input[name="ownPhone"]').fill("9999998881");
  await page.getByRole("button", { name: "Prepare test message" }).click();
  const link = page.getByRole("link", { name: "Open message to send" });
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  expect(href).toContain("https://wa.me/919999998881?text=");
  expect(decodeURIComponent(href)).toContain("[TEST]");
  expect(
    await prisma.notificationLog.count({
      where: { customerId: customer.id, status: "PREPARED_FOR_MANUAL_SEND" },
    }),
  ).toBe(1);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("cell", { name: "PREPARED FOR MANUAL SEND", exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/template-test-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  await writeFile(
    ".local/template-test-result.json",
    JSON.stringify(
      {
        passed: true,
        wrongNumberRejected: true,
        manualLinkPrepared: true,
        testLabel: true,
        messagesSent: 0,
        mainShopTouched: false,
      },
      null,
      2,
    ),
  );
  console.log(
    "Personal template test browser flow passed. Wrong number blocked; manual test link prepared but never opened or sent.",
  );
} finally {
  if (customer) {
    await prisma.notificationLog.deleteMany({
      where: { customerId: customer.id },
    });
    await prisma.customer.delete({ where: { id: customer.id } });
  }
  if (template)
    await prisma.notificationTemplate.delete({ where: { id: template.id } });
  await test.close();
}

