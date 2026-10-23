import { test, expect } from "@playwright/test";
try {
  process.loadEnvFile(".env.local");
} catch {}
test("staff can review reports, purchase orders and doctor hours", async ({
  page,
}) => {
  test.skip(!process.env.SEED_OWNER_PASSWORD);
  test.setTimeout(180000);
  page.setDefaultTimeout(20000);
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill(process.env.SEED_OWNER_EMAIL!);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SEED_OWNER_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30000 });
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
    await page.goto(`/reports?kind=${kind}`);
    await expect(
      page.getByRole("heading", { name: "Reports", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/rows$/)).toBeVisible();
  }
  const downloaded = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download CSV" }).click();
  expect((await downloaded).suggestedFilename()).toMatch(/^credit.*\.csv$/);
  await page.goto("/purchases/orders");
  await page.locator("summary").filter({ hasText: "Suggested order" }).click();
  await page.getByRole("button", { name: "Create draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Draft created");
  await page.locator("tbody a").first().click();
  await expect(
    page.getByRole("button", { name: "Confirm order", exact: true }),
  ).toBeVisible();
  await page.locator("summary").filter({ hasText: "Cancel order" }).click();
  await page.getByRole("checkbox", { name: /Cancel this order/ }).check();
  await page.getByRole("button", { name: "Cancel order", exact: true }).click();
  await expect(
    page
      .getByRole("paragraph")
      .filter({ hasText: /CANCELLED/ })
      .first(),
  ).toBeVisible();
  await page.goto("/appointments/doctors");
  await page.locator("main .panel a").first().click();
  await page.getByRole("button", { name: "Save doctor", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("weekly hours saved");
  await page.goto("/appointments?view=week");
  await expect(
    page.getByRole("combobox", { name: "View", exact: true }),
  ).toHaveValue("week");
  await page.goto("/notifications/reminders");
  await expect(
    page.getByRole("heading", { name: "Reminders", exact: true }),
  ).toBeVisible();
  await page.goto("/stock/transfers");
  await expect(
    page.getByRole("heading", { name: "Branch transfers", exact: true }),
  ).toBeVisible();
});
